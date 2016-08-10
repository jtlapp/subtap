#!/usr/bin/env node

//// MODULES //////////////////////////////////////////////////////////////////

var resolveModule = require('resolve').sync;
var resolvePath = require('path').resolve;
var parseOpts = require('minimist');
var glob = require('glob');
var tapParser = require('tap-parser');
var _ = require('lodash');

var SubtapPrinter = require("../");

//// CONSTANTS ////////////////////////////////////////////////////////////////

var TAB_SIZE = 2;

//// CONFIGURATION ////////////////////////////////////////////////////////////

var options = parseOpts(process.argv.slice(2), {
    alias: {
        b: 'bailOnFail',
        d: 'dots',
        f: 'onlyFailures',
        h: 'help',
        m: 'monochrome',
        n: 'selectedTest',
        o: 'outputFormat'
    },
    boolean: [ 'b', 'd', 'f', 'h', 'm', 'n' ],
    string: [ 'o' ]
});
var outputFormat = (options.outputFormat ? 
                    options.outputFormat.toLowerCase() : 'pretty');
if (['json', 'tap', 'pretty'].indexOf(outputFormat) === -1)
    exitWithError("unrecognized output format '"+ outputFormat +"'");

// TBD: error if no files; or maybe default to test/ and tests/; or maybe default to stdin and make that case not dependent on node-tap; actually, a -i option for stdin would be best

if (options.help) {
    console.log(
        "subtap [options] [files]"+
        "\n"+
        "options:"+
        "  -b  : bail on first assertion to fail"+
        "  -d  : show dots instead of assertions"+
        "  -dN : show one dot per N assertions"+
        "  -f  : only show failing tests and assertions"+
        "  -h  : show this help information"+
        "  -n  : only show test numbers and failures"+
        "  -nN : run only test number N"+
        "  -m  : output in monochrome"+
        "  -o json : output TAP events in JSON"+
        "  -o tap  : output raw TAP text"+
        "\n"
    );
    process.exit(0);
}

var selectedTest = options.selectedTest;
var prettyMode = SubtapPrinter.SHOW_ALL;
if (outputFormat === 'json')
    prettyMode = SubtapPrinter.SHOW_EVENTS;
else if (options.onlyFailures)
    prettyMode = SubtapPrinter.SHOW_FAILURES;
else if (selectedTest === true)
    prettyMode = SubtapPrinter.SHOW_ROOT;
if (selectedTest === true)
    selectedTest = false; // no number selected
    
if (selectedTest === 0) {
    exitWithError("-n option requires a on-zero test number (e.g. -n42)");
}

var cwd = process.cwd();
var testFileRegex = new RegExp(" \\("+ _.escapeRegExp(cwd) +"/(.+:[0-9]+):");

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber = 0;

//// INSTALL TAP //////////////////////////////////////////////////////////////

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
    tap = require(tapPath); // assume testing tapo module itself
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

//// INSTALL PARSER ///////////////////////////////////////////////////////////

var printer = null;
if (outputFormat !== 'tap') {
    var parser = tapParser();
    printer = new SubtapPrinter(parser, {
        tabSize: TAB_SIZE,
        dots: options.dots,
        monochrome: options.monochrome,
        filterStackFromPath: __filename,
        prettyMode: prettyMode
    });
    tap.pipe(parser.on('error', function (err) {
        /**/ console.log("GOT ERROR: "+ err.message);
    }));
}

//// RUN TESTS ////////////////////////////////////////////////////////////////

// this glob code is copied from https://github.com/substack/tape
options._.forEach(function (arg) {
    glob.sync(arg).forEach(function (file) {
        require(resolvePath(cwd, file));
    });
});

setImmediate(function () {
    if (selectedTest !== false && selectedTest > testNumber)
        exitWithError("test "+ selectedTest +" not found");
});

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function exitWithError(message) {
    console.log("*** %s ***\n", message);
    process.exit(1);
}
