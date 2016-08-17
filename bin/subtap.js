#!/usr/bin/env node

//// MODULES //////////////////////////////////////////////////////////////////

var resolveModule = require('resolve').sync;
var resolvePath = require('path').resolve;
var minimist = require('minimist');
var glob = require('glob');
var tapParser = require('tap-parser');
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

// TBD: error if no files; or maybe default to test/ and tests/; or maybe default to stdin and make that case not dependent on node-tap; actually, a -i option for stdin would be best

if (options.help) {
    console.log(
        "subtap [options] [files]\n"+ // TBD: say more
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
        new subtap.JsonPrinter(parser, {
            truncateStackAtPath: __filename
        });
        tap.pipe(parser);
    },
    tally: function() {
        return installReport(subtap.RootTestReport);
    },
    tap: function() {
        // nothing to do; not filtering output of parser
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
    
var cwd = process.cwd();
var testFileRegex = new RegExp(" \\("+ _.escapeRegExp(cwd) +"/(.+:[0-9]+):");

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber = 0;

//// CUSTOMIZE TAP ////////////////////////////////////////////////////////////

if (options.bailOnFail)
    process.env.TAP_BAIL = '1'; // must set prior to loading tap

var tapPath;
var tap;
try {
    tapPath = "tap";
    tap = require(resolveModule(tapPath, { basedir: cwd }));
}
catch(err) {
    tapPath = "..";
    tap = require(tapPath); // assume testing subtap module itself
}

var testMethod = tap.test;
tap.test = function subtapTest(name, extra, cb, deferred) {
    ++testNumber;
    if (selectedTest !== false && testNumber !== selectedTest)
        return;
    if (!deferred) {
        name = '['+ testNumber +'] '+ name;
        
        // append file name and line number of test to test name
        var err = new Error();
        var matches = err.stack.match(testFileRegex);
        if (matches !== null)
            name += ' ('+ matches[1] +')';
    }
    testMethod.call(this, name, extra, cb, deferred);
};

//// RUN TESTS ////////////////////////////////////////////////////////////////

// install TAP listener before running tests found in the files

installReceiver();

// this glob code is copied from https://github.com/substack/tape

options._.forEach(function (arg) {
    glob.sync(arg).forEach(function (file) {
        require(resolvePath(cwd, file));
    });
});

// perform this check after all tests have been registered and counted

setImmediate(function () {
    if (selectedTest !== false && selectedTest > testNumber)
        exitWithError("test "+ selectedTest +" not found");
});

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function exitWithError(message) {
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
    new subtap.PrettyPrinter(parser, new reportClass({
        tabSize: TAB_SIZE,
        styleMode: colorMode,
        highlightMargin: DIFF_HIGHLIGHT_MARGIN,
        minHighlightWidth: MIN_DIFF_HIGHLIGHT_WIDTH,
        truncateStackAtPath: __filename,
        writeFunc: (canonical ? helper.canonicalize.bind(this, write) : write)
    }));
    tap.pipe(parser);
}

function write(text) {
    process.stdout.write(text);
}
