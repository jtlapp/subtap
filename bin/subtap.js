#!/usr/bin/env node

//// MODULES //////////////////////////////////////////////////////////////////

var fs = require('fs');
var resolveModule = require('resolve');
var path = require('path');
var minimist = require('minimist');
var glob = require('glob');
var tapParser = require('tap-parser');
var childProcess = require('child_process');

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
        var parser = new tapParser();
        var printer = new subtap.JsonPrinter(parser, {
            truncateStackAtPath: __filename
        });
        tap.pipe(parser);
        return printer;
    },
    tally: function() {
        return installReport(subtap.RootTestReport);
    },
    tap: function() {
        // nothing to do; not filtering output of parser
        return null;
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
    exitWithError("-n option requires a on-zero test number (e.g. -n42)");
    
if (options._.length === 0) {
    options._.push("test/*.js");
    options._.push("tests/*.js");
}

var cwd = process.cwd();

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber = 0;

//// CUSTOMIZE TAP ////////////////////////////////////////////////////////////

var tapPath;
try {
    tapPath = "tap";
    require(resolveModule.sync(tapPath, { basedir: cwd }));
}
catch(err) {
    tapPath = "..";
    require(tapPath); // assume testing subtap module itself
}

var childEnv = (options.bailOnFail ? { TAP_BAIL: '1' } : {});

//// RUN TESTS ////////////////////////////////////////////////////////////////

// Run the test files strictly sequentially so we can get root test counts for each file to number root tests with some run-to-run stability.

var filePaths = [];
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



// perform this check after all tests have been registered and counted

setImmediate(function () {
    if (testNumber === 0)
        exitWithError("no tests found");
    if (selectedTest !== false && selectedTest > testNumber)
        exitWithError("test "+ selectedTest +" not found");
});

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
    var parser = tapParser();
    var printer = new subtap.PrettyPrinter(parser, new reportClass({
        tabSize: TAB_SIZE,
        styleMode: colorMode,
        highlightMargin: DIFF_HIGHLIGHT_MARGIN,
        minHighlightWidth: MIN_DIFF_HIGHLIGHT_WIDTH,
        truncateStackAtPath: __filename,
        writeFunc: (canonical ? helper.canonicalize.bind(this, write) : write)
    }));
    tap.pipe(parser);
    return printer;
}

function runNextFile() {
    spawn(
}

function write(text) {
    process.stdout.write(text);
}
