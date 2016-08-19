#!/usr/bin/env node

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
var helper = require("../lib/helper");

//// CONSTANTS ////////////////////////////////////////////////////////////////

var TAB_SIZE = 2; // spaces by which to indent each nested level of data
var DIFF_HIGHLIGHT_MARGIN = 80; // right margin of multiline highlights
var MIN_DIFF_HIGHLIGHT_WIDTH = 30; // min. width of multiline highlights

//// CONFIGURATION ////////////////////////////////////////////////////////////

var argv = process.argv.slice(2);
var dashDashOptions = extractDashDashOptions(argv);
var options = minimist(argv, {
    alias: {
        b: 'bailOnFail',
        c: 'colorMode',
        h: 'help',
        n: 'selectedTest'
    },
    boolean: [ 'b', 'c', 'h', 'n' ],
});

if (options.help) {
    console.log(
        "subtap [options] [file-patterns]\n"+ // TBD: say more
        "(only works with JS files that require 'tap')\n"+
        "\n"+
        "options:\n"+
        "  -b  : bail on first assertion to fail\n"+
        "  -c0 : no color, emphasis, or other ANSI codes\n"+
        "  -c1 : monochrome mode, emphasis allowed\n"+
        "  -c2 : multicolor mode (default)\n"+
        "  -h  : show this help information\n"+
        "  -nN : run only test number N\n"+
        "  --fail : restrict output to tests + assertions that fail\n"+
        "  --all  : output results of all tests and assertions\n"+
        "  --json : output TAP events in JSON\n"+
        "  --tally: restrict output to root tests + failures (default)\n"+
        "  --tap  : output raw TAP text\n"
    );
    process.exit(0);
}

var installerMap = {
    all: function() {
        return installReport(subtap.FullReport);
    },
    fail: function () {
        return installReport(subtap.FailureReport);
    },
    json: function() {
        return new subtap.JsonPrinter({
            truncateStackAtPath: __filename
        });
    },
    tally: function() {
        return installReport(subtap.RootTestReport);
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
    exitWithError("more than one --output_format specified");
var outputFormat = 'tally';
if (dashDashOptions.length === 1)
    outputFormat = dashDashOptions[0];
var installReceiver = installerMap[outputFormat];
if (!installReceiver)
    exitWithError("unrecognized output format --"+ outputFormat);
    
var colorMode = options.colorMode;
if (colorMode === true)
    exitWithError("-cN option requires a color mode number (e.g. -c1)");
if (colorMode === false)
    colorMode = 2;
if (!(colorMode <= 2 || colorMode >= 10 && colorMode <= 12))
    exitWithError("-cN option requires a valid color mode (-h for help)");

// secret canonical output mode for self-testing = colorMode + 10
var canonical = false;
if (colorMode >= 10) {
    canonical = true;
    colorMode -= 10;
}

var selectedTest = options.selectedTest;
if (selectedTest === 0 || selectedTest === true)
    exitWithError("-n option requires a non-zero test number (e.g. -n42)");

var maxFailedTests = 0; // assume no maximum
if (_.isNumber(options.bailOnFail)) {
    maxFailedTests = options.bailOnFail;
    options.bailOnFail = false;
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

var childPath = path.resolve(__dirname, "_runfile.js");
var childEnv = (options.bailOnFail ? { TAP_BAIL: '1' } : {});

//// STATE ////////////////////////////////////////////////////////////////////

var filePaths = []; // array of all test files to run
var fileIndex = 0; // index of the next test file to run
var testNumber = 0; // number of most-recently output root test
var failedTests = 0; // number of tests that have failed
var bailed = false; // whether test file bailed out
var skippingChunks = false; // whether skipping TAP output

//// RUN TESTS ////////////////////////////////////////////////////////////////

// If no files are specified, assume all .js in ./test and ./tests.

if (options._.length === 0) {
    options._.push("test/*.js");
    options._.push("tests/*.js");
}

// Run the test files strictly sequentially so that, for a given set of test files, root tests have consistent numbers from run-to-run.

options._.forEach(function (pattern) {
    glob.sync(pattern, {
        nodir: true
    }).forEach(function (file) {
        filePaths.push(path.resolve(cwd, file));
    });
});
if (filePaths.length === 0)
    exitWithError("no files match pattern");

var receiver = installReceiver(); // prepare to listen to run of tests
runNextFile(); // run first file; each subsequent file runs after prev closes

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function exitWithError(message) {
    if (receiver)
        receiver.abort();
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

function installReport(reportClass) {
    return new subtap.PrettyPrinter(new reportClass({
        tabSize: TAB_SIZE,
        styleMode: colorMode,
        highlightMargin: DIFF_HIGHLIGHT_MARGIN,
        minHighlightWidth: MIN_DIFF_HIGHLIGHT_WIDTH,
        truncateStackAtPath: __filename,
        writeFunc: (canonical ? helper.canonicalize.bind(this, write) : write)
    }));
}

function runNextFile() {
    // fork so can use IPC to communicate test numbers and bail-out
    var child = fork(childPath, [tapPath], {env: childEnv});
    
    child.on('message', function (msg) {
        switch (msg.event) {
            case 'chunk':
                var text = msg.text;
                if (/^\d+\.\.\d+/.test(text))
                    skippingChunks = true;
                if (!skippingChunks)
                    receiver.write(text);
                if (text.indexOf('TAP version') === 0)
                    skippingChunks = false;
                break;
            case 'bailout':
                bailed = true;
                break;
            case 'done':
                // TBD: child.kill();
                testNumber = msg.lastTestNumber;
                failedTests = msg.failedTests;
                break;
        }
    });
    
    child.on('exit', function (exitCode) {
        // exitCode == 1 if any test fails, so can't bail run
        if (bailed)
            return;
        if (fileIndex < filePaths.length)
            return runNextFile();
        if (testNumber === 0)
            exitWithError("no tests found");
        if (selectedTest !== false && selectedTest > testNumber)
            exitWithError("test "+ selectedTest +" not found");
        receiver.end();
    });
    
    child.send({
        priorTestNumber: testNumber,
        testFileRegexStr: testFileRegexStr,
        selectedTest: selectedTest,
        failedTests: failedTests,
        maxFailedTests: maxFailedTests,
        filePath: filePaths[fileIndex++]
    });
}

function write(text) {
    process.stdout.write(text);
}
