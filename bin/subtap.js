#!/usr/bin/env node

//// MODULES //////////////////////////////////////////////////////////////////

var Writable = require('stream').Writable;
var resolveModule = require('resolve');
var path = require('path');
var minimist = require('minimist');
var glob = require('glob');
var fork = require('child_process').fork;
var _ = require('lodash');

var subtap = require("../");
var callstack = require("../lib/callstack");

//// CONSTANTS ////////////////////////////////////////////////////////////////

var TAB_SIZE = 2; // default spaces by which to indent each level of nesting
var MIN_RESULTS_WIDTH = 30; // min width at which to wrap failure results area
var MIN_RESULTS_MARGIN = 80; // min right-margin wrap column for failure results
var DEFAULT_TIMEOUT_MILLIS = 3000; // default timeout period for inactivity

//// CONFIGURATION ////////////////////////////////////////////////////////////

var argv = process.argv.slice(2);
var dashDashOptions = extractDashDashOptions(argv);
var stringOptions = extractStringOptions(argv, ['d', 'w']);
var basicOptions = minimist(argv, {
    alias: {
        b: 'bailOnFail',
        c: 'colorMode',
        e: 'embedExceptions',
        f: 'showFunctionSource',
        h: 'help',
        i: 'tabSize',
        n: 'selectedTest',
        t: 'timeoutMillis'
    },
    boolean: [ 'b', 'c', 'e', 'f', 'h', 'i', 'n'],
    default: {
        t: DEFAULT_TIMEOUT_MILLIS
    }
});

if (basicOptions.help) {
    console.log(
        "subtap [options] [file-patterns]\n"+ // TBD: say more
        "(only works with JS files that require 'tap')\n"+
        "\n"+
        "options:\n"+
        "  -b     : bail on first assertion to fail\n"+
        "  -bN    : bail after the N root subtests fail\n"+
        "  -c0    : no color, emphasis, or other ANSI codes\n"+
        "  -c1    : monochrome mode, emphasis allowed\n"+
        "  -c2    : multicolor mode (default)\n"+
        "  -dCIU  : found/wanted diff flags (default CU)\n"+
        "           - (C) color diff text\n"+
        "           - (I) interleave diff lines\n"+
        "           - (U) underline 1st diff\n"+
        "  -e     : catch and embed subtest exceptions in output\n"+
        "  -f     : output source code of functions in found/wanted values\n"+
        "  -h     : show this help information\n"+
        "  -iN    : indent each level of nesting by N spaces (default 2)\n"+
        "  -nN    : run only test number N\n"+
        "  -tN    : timeout for inactivity after N millisecs; 0 = off (default 3000)\n"+
        "  -wM:N  : results area min width (M), min wrap column (N) (default 20:80)\n"+ 
        "  --fail : restrict output to tests + assertions that fail\n"+
        "  --all  : output results of all tests and assertions\n"+
        "  --json : output TAP events in JSON\n"+
        "  --tally: restrict output to root subtests + failures (default)\n"+
        "  --tap  : output raw TAP text\n"
    );
    process.exit(0);
}

var childPath = path.resolve(__dirname, "_runfile.js");
var printerMakerMap = {
    all: function() {
        return makePrettyPrinter(subtap.FullReport);
    },
    fail: function () {
        return makePrettyPrinter(subtap.FailureReport);
    },
    json: function() {
        return new subtap.JsonPrinter(process.stdout, {
            truncateTraceAtPath: childPath
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
    
var colorMode = basicOptions.colorMode;
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

var selectedTest = basicOptions.selectedTest;
if (selectedTest === 0 || selectedTest === true)
    exitWithUserError("-n option requires a non-zero test number (e.g. -n42)");

var maxFailedTests = 0; // assume no maximum
if (_.isNumber(basicOptions.bailOnFail)) {
    maxFailedTests = basicOptions.bailOnFail;
    basicOptions.bailOnFail = false;
}
var childEnv = (basicOptions.bailOnFail ? { TAP_BAIL: '1' } : {});

if (basicOptions.tabSize === true || basicOptions.tabSize === 0)
    exitWithUserError("-iN option requires a tab size N >= 1");
    
if (!_.isUndefined(stringOptions.w)) {
    var matches = stringOptions.w.match(/^(\d+):(\d+)$/);
    if (!matches)
        exitWithUserError("-wM:N option requires two colon-separated integers");
    else {
        stringOptions.minResultsWidth = matches[1];
        stringOptions.minResultsMargin = matches[2];
        if (stringOptions.minResultsWidth < 2)
            exitWithUserError("-wM:N potion requires M >= 2");
    }
}

if (!_.isUndefined(stringOptions.w)) {
    stringOptions.colorDiffText = (stringOptions.w.indexOf('C') >= 0);
    stringOptions.underlineFirstDiff = (stringOptions.w.indexOf('U') >= 0);
    stringOptions.interleaveDiffs = (stringOptions.w.indexOf('I') >= 0);
}
    
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
var gotPulse; // whether child process was recently active
var timer; // heartbeat timer monitoring child activity

//// RUN TESTS ////////////////////////////////////////////////////////////////

// If no files are specified, assume all .js in ./test and ./tests.

if (basicOptions._.length === 0) {
    basicOptions._.push("test/*.js");
    basicOptions._.push("tests/*.js");
}

// Run the test files strictly sequentially so that, for a given set of test files, root subtests have consistent numbers from run-to-run.

basicOptions._.forEach(function (pattern) {
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
    var callInfo = callstack.getDeepestCallInfo(stack, false);
    process.stderr.write("\n");
    if (callInfo !== null) {
        process.stderr.write(callInfo.file +":"+
                callInfo.line +":"+ callInfo.column +"\n");
        process.stderr.write(callInfo.source +"\n");
        process.stderr.write(' '.repeat(callInfo.column - 1));
        process.stderr.write("^\n");
    }
    process.stderr.write(stack +"\n\n");
    process.exit(1);
}

function exitWithUserError(message) {
    if (outputFormat !== 'tap' && printer)
        printer.abort();
    writeErrorMessage(message);
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

function extractStringOptions(argv, optionLetters) {
    var stringOptions = {};
    var i = argv.length;
    while (--i >= 0) {
        optionLetters.forEach(function(letter) {
            if (argv[i].startsWith('-'+ letter)) {
                stringOptions[letter] = argv[i].substr(2);
                argv.splice(i, 1);
            }
        });
    }
    return stringOptions;
}

function makePrettyPrinter(reportClass) {
    return new subtap.PrettyPrinter(new reportClass(process.stdout, {
        tabSize: basicOptions.tabSize || TAB_SIZE,
        styleMode: colorMode,
        minResultsWidth: stringOptions.minResultsWidth || MIN_RESULTS_WIDTH,
        minResultsMargin: stringOptions.minResultsMargin || MIN_RESULTS_MARGIN,
        truncateTraceAtPath: childPath,
        showFunctionSource: basicOptions.showFunctionSource,
        colorDiffText: stringOptions.colorDiffText || true,
        underlineFirstDiff: stringOptions.underlineFirstDiff || true,
        interleaveDiffs: stringOptions.interleaveDiffs || false,
        canonical: canonical
    }));
}

function runNextFile() {
    // fork so can use IPC to communicate test numbers and bail-out
    var child = fork(childPath, [tapPath], {env: childEnv});
    
    child.on('message', function (msg) {
        gotPulse = true;
        switch (msg.event) {
            case 'ready':
                child.send({
                    priorTestNumber: testNumber,
                    testFileRegexStr: testFileRegexStr,
                    selectedTest: selectedTest,
                    failedTests: failedTests,
                    maxFailedTests: maxFailedTests,
                    embedExceptions: basicOptions.embedExceptions,
                    filePath: filePaths[fileIndex++]
                });
                break;
            case 'chunk':
                var text = msg.text;
                if (/^bail out!/i.test(text)) {
                    clearTimeout(timer);
                    bailed = true;
                }
                else if (/^\d+\.\.\d+/.test(text))
                    skippingChunks = true;
                if (!skippingChunks)
                    printer.write(text);
                if (text.indexOf('TAP version') === 0)
                    skippingChunks = false;
                break;
            case 'error':
                clearTimeout(timer);
                child.kill('SIGKILL');
                exitWithTestError(msg.stack);
                break;
            case 'done':
                clearTimeout(timer);
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
    
    gotPulse = true;
    if (basicOptions.timeoutMillis > 0)
        awaitHeartbeat(child);
}

function awaitHeartbeat(child) {
    timer = setTimeout(function() {
        if (!gotPulse) {
            child.kill('SIGKILL');
            var filePath = filePaths[fileIndex - 1];
            if (filePath.indexOf(cwd) === 0)
                filePath = filePath.substr(cwd.length + 1);
            writeErrorMessage(filePath +" timed out after "+
                    basicOptions.timeoutMillis +" millis of inactivity");
            process.exit(1);
        }
        gotPulse = false;
        awaitHeartbeat(child);
    }, basicOptions.timeoutMillis);
}

function writeErrorMessage(message) {
    process.stdout.write("*** "+ message +" ***\n\n");
}