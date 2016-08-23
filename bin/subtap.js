#!/usr/bin/env node

// TBD: add timeout for _runfile ready or done events

//// MODULES //////////////////////////////////////////////////////////////////

var fs = require('fs');
var Writable = require('stream').Writable;
var resolveModule = require('resolve');
var path = require('path');
var minimist = require('minimist');
var glob = require('glob');
var fork = require('child_process').fork;
var _ = require('lodash');

var subtap = require("../");

//// CONSTANTS ////////////////////////////////////////////////////////////////

var TAB_SIZE = 2; // default spaces by which to indent each level of nesting
var DIFF_HIGHLIGHT_MARGIN = 80; // right margin of multiline highlights
var MIN_DIFF_HIGHLIGHT_WIDTH = 30; // min. width of multiline highlights

//// CONFIGURATION ////////////////////////////////////////////////////////////

var argv = process.argv.slice(2);
var dashDashOptions = extractDashDashOptions(argv);
var options = minimist(argv, {
    alias: {
        b: 'bailOnFail',
        c: 'colorMode',
        e: 'embedExceptions',
        f: 'showFunctionSource',
        h: 'help',
        i: 'tabSize',
        n: 'selectedTest',
        w: 'wrapColumn'
    },
    boolean: [ 'b', 'c', 'e', 'f', 'h', 'i', 'n', 'w' ],
});

if (options.help) {
    console.log(
        "subtap [options] [file-patterns]\n"+ // TBD: say more
        "(only works with JS files that require 'tap')\n"+
        "\n"+
        "options:\n"+
        "  -b  : bail on first assertion to fail\n"+
        "  -bN : bail after the N root subtests fail\n"+
        "  -c0 : no color, emphasis, or other ANSI codes\n"+
        "  -c1 : monochrome mode, emphasis allowed\n"+
        "  -c2 : multicolor mode (default)\n"+
        "  -e  : catch and embed subtest exceptions in output\n"+
        "  -f  : output entire source of functions found in diffs\n"+
        "  -h  : show this help information\n"+
        "  -iN : indent each level of nesting by N spaces (default 2)\n"+
        "  -nN : run only test number N\n"+
        //"  -mN : min width of failure results output area (default ?)\n"+
        //"  -wN : wrap failure results output at Nth column (default 80)\n"+
        "  --fail : restrict output to tests + assertions that fail\n"+
        "  --all  : output results of all tests and assertions\n"+
        "  --json : output TAP events in JSON\n"+
        "  --tally: restrict output to root subtests + failures (default)\n"+
        "  --tap  : output raw TAP text\n"
    );
    process.exit(0);
}

var childPath = path.resolve(__dirname, "_runfile.js");
var childEnv = (options.bailOnFail ? { TAP_BAIL: '1' } : {});

var printerMakerMap = {
    all: function() {
        return makePrettyPrinter(subtap.FullReport);
    },
    fail: function () {
        return makePrettyPrinter(subtap.FailureReport);
    },
    json: function() {
        return new subtap.JsonPrinter(process.stdout, {
            truncateStackAtPath: childPath
        });
    },
    tally: function() {
        return makePrettyPrinter(subtap.RootSubtestReport);
    },
    tap: function() {
        return new Writable({
            write: function(chunk, encoding, done) {
                process.stdout.write(chunk.toString());
                done();
            }
        });
    }
};

if (dashDashOptions.length > 1)
    exitWithUserError("more than one output format specified");
var outputFormat = 'tally';
if (dashDashOptions.length === 1)
    outputFormat = dashDashOptions[0];
var makePrinter = printerMakerMap[outputFormat];
if (!makePrinter)
    exitWithUserError("unrecognized output format '"+ outputFormat +"'");
    
var colorMode = options.colorMode;
if (colorMode === true)
    exitWithUserError("-cN option requires a color mode number (e.g. -c1)");
if (colorMode === false)
    colorMode = 2;
if (!(colorMode <= 2 || colorMode >= 10 && colorMode <= 12))
    exitWithUserError("-cN option requires a valid color mode (-h for help)");

// colorMode + 10 = secret canonical output mode for self-testing
var canonical = false;
if (colorMode >= 10) {
    canonical = true;
    colorMode -= 10;
}

var selectedTest = options.selectedTest;
if (selectedTest === 0 || selectedTest === true)
    exitWithUserError("-n option requires a non-zero test number (e.g. -n42)");

var maxFailedTests = 0; // assume no maximum
if (_.isNumber(options.bailOnFail)) {
    maxFailedTests = options.bailOnFail;
    options.bailOnFail = false;
}
if (options.tabSize === true || options.tabSize === 0)
    exitWithUserError("-iN option requires a tab size N >= 1");
//if (options.wrapColumn === true || options.wrapColumn < 20 /*broken*/)
//    exitWithUserError("-wN option requires a wrap column N >= 20");
    
var cwd = process.cwd();
var testFileRegexStr = " \\("+ _.escapeRegExp(cwd) +"/(.+:[0-9]+):";

// Locate the installation of the tap module that these test files will use. We need to tweak loads of this particular installation.

var tapPath;
try {
    tapPath = resolveModule.sync('tap', { basedir: cwd });
    require(tapPath);
}
catch(err) {
    tapPath = path.resolve(__dirname, '..');
    require(tapPath); // assume testing subtap module itself
}

//// STATE ////////////////////////////////////////////////////////////////////

var filePaths = []; // array of all test files to run
var fileIndex = 0; // index of the next test file to run
var testNumber = 0; // number of most-recently output root subtest
var failedTests = 0; // number of tests that have failed
var bailed = false; // whether test file bailed out
var skippingChunks = false; // whether skipping TAP output

//// RUN TESTS ////////////////////////////////////////////////////////////////

// If no files are specified, assume all .js in ./test and ./tests.

if (options._.length === 0) {
    options._.push("test/*.js");
    options._.push("tests/*.js");
}

// Run the test files strictly sequentially so that, for a given set of test files, root subtests have consistent numbers from run-to-run.

options._.forEach(function (pattern) {
    glob.sync(pattern, {
        nodir: true
    }).forEach(function (file) {
        filePaths.push(path.resolve(cwd, file));
    });
});
if (filePaths.length === 0)
    exitWithUserError("no files match pattern");

var printer = makePrinter();
runNextFile(); // run first file; each subsequent file runs after prev closes

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function exitWithTestError(stack) {
    var matches = stack.match(/ \(([^):]+)(:(\d+):(\d+))?/);
    process.stderr.write("\n");
    if (!_.isUndefined(matches[2])) {
        try {
            var fileText = fs.readFileSync(matches[1], 'utf8');
            var lines = fileText.split("\n");
            process.stderr.write(matches[1] + matches[2] +"\n");
            process.stderr.write(lines[parseInt(matches[3]) - 1] +"\n");
            process.stderr.write(' '.repeat(parseInt(matches[4] - 1)));
            process.stderr.write("^\n");
        }
        catch (err) {
            // if can't read the file, just show the exception (stack)
        }
    }
    process.stderr.write(stack +"\n\n");
    process.exit(1);
}

function exitWithUserError(message) {
    if (outputFormat !== 'tap' && printer)
        printer.abort();
    console.log("*** %s ***\n", message);
    process.exit(1);
}

function extractDashDashOptions(argv) {
    var dashDashTerms = [];
    var i = argv.length;
    while (--i >= 0) {
        if (argv[i].startsWith('--')) {
            dashDashTerms.push(argv[i].substr(2).toLowerCase());
            argv.splice(i, 1);
        }
    }
    return dashDashTerms;
}

function makePrettyPrinter(reportClass) {
    return new subtap.PrettyPrinter(new reportClass(process.stdout, {
        tabSize: options.tabSize || TAB_SIZE,
        styleMode: colorMode,
        highlightMargin: DIFF_HIGHLIGHT_MARGIN,
        minHighlightWidth: MIN_DIFF_HIGHLIGHT_WIDTH,
        truncateStackAtPath: childPath,
        showFunctionSource: options.showFunctionSource,
        canonical: canonical
    }));
}

function runNextFile() {
    // fork so can use IPC to communicate test numbers and bail-out
    var child = fork(childPath, [tapPath], {env: childEnv});
    
    child.on('message', function (msg) {
        switch (msg.event) {
            case 'ready':
                child.send({
                    priorTestNumber: testNumber,
                    testFileRegexStr: testFileRegexStr,
                    selectedTest: selectedTest,
                    failedTests: failedTests,
                    maxFailedTests: maxFailedTests,
                    embedExceptions: options.embedExceptions,
                    filePath: filePaths[fileIndex++]
                });
                break;
            case 'chunk':
                var text = msg.text;
                if (/^bail out!/i.test(text))
                    bailed = true;
                else if (/^\d+\.\.\d+/.test(text))
                    skippingChunks = true;
                if (!skippingChunks)
                    printer.write(text);
                if (text.indexOf('TAP version') === 0)
                    skippingChunks = false;
                break;
            case 'error':
                child.kill('SIGKILL');
                exitWithTestError(msg.stack);
                break;
            case 'done':
                child.kill('SIGKILL');
                testNumber = msg.lastTestNumber;
                failedTests = msg.failedTests;
                break;
        }
    });
    
    child.on('exit', function (exitCode) {
        // exitCode == 1 if any test fails, so can't bail run
        if (!bailed) {
            if (fileIndex < filePaths.length)
                return runNextFile();
            if (testNumber === 0)
                exitWithUserError("no subtests found");
            if (selectedTest !== false && selectedTest > testNumber)
                exitWithUserError("test "+ selectedTest +" not found");
        }
        printer.end();
    });
}
