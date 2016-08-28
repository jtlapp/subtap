#!/usr/bin/env node

// To debug, put child on different debug port via --node-arg=--debug=5859

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

var OUTPUT_FORMATS = [ 'all', 'fail', 'json', 'tally', 'tap' ];

//// ARGUMENT CONFIGURATION ///////////////////////////////////////////////////

var argv = process.argv.slice(2);
var minimistConfig = {
    alias: {
        b: 'bailOnFail',
        c: 'colorMode',
        d: 'diffFlags',
        e: 'embedExceptions',
        f: 'showFunctionSource',
        h: 'help',
        i: 'tabSize',
        n: 'selectedTest',
        t: 'timeoutMillis',
        w: 'minWidthAndMargin'
    },
    boolean: [ 'b', 'c', 'e', 'f', 'h', 'i', 'n' ],
    string: [ 'd', 'w', 'node-arg' ],
    default: {
        i: 2, // tab size
        t: 3000, // heartbeat timeout millis
        d: 'BCU', // differences format
        w: '20:80' // minimum width : minimum margin
    }
};
var options = minimist(argv, minimistConfig);
applyBooleanOffSwitches(options, minimistConfig);

if (options.help) {
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
        "  -d     : don't indicate differences in values\n"+
        "  -d BCIU: found/wanted diff flags (default BCU)\n"+
        "           - (B) bold the different text\n"+
        "           - (C) color the different text\n"+
        "           - (I) interleave different lines\n"+
        "           - (U) underline the first differingn character\n"+
        "  -e     : catch and embed subtest exceptions in output\n"+
        "  -f     : output source code of functions in found/wanted values\n"+
        "  -h     : show this help information\n"+
        "  -iN    : indent each level of nesting by N spaces (default 2)\n"+
        "  -nN    : run only test number N\n"+
        "  -tN    : timeout for inactivity after N millisecs; 0 = off (default 3000)\n"+
        "  -w M:N : results area min width (M), min wrap column (N) (default 20:80)\n"+ 
        "  --fail : restrict output to tests + assertions that fail\n"+
        "  --all  : output results of all tests and assertions\n"+
        "  --json : output tap-parser events in JSON\n"+
        "  --tally: restrict output to root subtests + failures (default)\n"+
        "  --tap  : output raw TAP text\n"+
        "  --node-arg arg: pass arg to node process in which test runs\n"
    );
    process.exit(0);
}

var outputFormat = null;
OUTPUT_FORMATS.forEach(function (name) {
    if (!_.isUndefined(options[name])) {
        if (outputFormat !== null)
            exitWithUserError("more than one output format specified");
        outputFormat = name;
    }
});
if (outputFormat === null)
    outputFormat = 'tally';

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
    
var matches = options.minWidthAndMargin.match(/^(\d+):(\d+)$/);
if (!matches)
    exitWithUserError("-wM:N option requires two colon-separated integers");
else {
    options.minResultsWidth = parseInt(matches[1]);
    options.minResultsMargin = parseInt(matches[2]);
    if (options.minResultsWidth < 2)
        exitWithUserError("-wM:N potion requires M >= 2");
}

options.diffFlags = options.diffFlags.toUpperCase();
var boldDiffText = getOptionFlag(options.diffFlags, 'B', true);
var colorDiffText = getOptionFlag(options.diffFlags, 'C', true);
var underlineFirstDiff = getOptionFlag(options.diffFlags, 'U', true);
var interleaveDiffs = getOptionFlag(options.diffFlags, 'I', false);
    
//// STATE ////////////////////////////////////////////////////////////////////

var filePaths = []; // array of all test files to run
var fileIndex = 0; // index of currently running test file
var testNumber = 0; // number of most-recently output root subtest
var failedTests = 0; // number of tests that have failed
var bailed = false; // whether test file bailed out
var skippingChunks = false; // whether skipping TAP output
var gotPulse; // whether child process was recently active
var timer; // heartbeat timer monitoring child activity

//// TEST RUNNER //////////////////////////////////////////////////////////////

var cwd = process.cwd();
var testFileRegexStr = " \\("+ _.escapeRegExp(cwd) +"/(.+:[0-9]+):";
var childPath = path.resolve(__dirname, "_runfile.js");
var childEnv = (options.bailOnFail ? { TAP_BAIL: '1' } : {});

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

// Grab the factory method for the printer indicated by outputFormat.

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
var makePrinter = printerMakerMap[outputFormat];
if (!makePrinter)
    exitWithUserError("unrecognized output format '"+ outputFormat +"'");

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
    var callInfo = callstack.getDeepestCallInfo(stack);
    console.error("");
    if (callInfo !== null) {
        console.error(callInfo.file +":"+ callInfo.line +":"+ callInfo.column);
        console.error(callInfo.source);
        console.error(' '.repeat(callInfo.column - 1) +"^");
    }
    console.error(stack +"\n");
    process.exit(1);
}

function exitWithUserError(message) {
    if (outputFormat !== 'tap' && printer)
        printer.abort();
    writeErrorMessage(message);
    process.exit(1);
}

function applyBooleanOffSwitches(options, config) {
    if (_.isUndefined(config.boolean))
        return;
    config.boolean.forEach(function (letter) {
        if (options[letter] === '-') {
            options[letter] = false;
            if (!_.isUndefined(config.alias[letter]))
                options[config.alias[letter]] = false;
        }
        // booleans are sometimes also numbers
        if (_.isString(options[letter]))
            exitWithUserError("invalid -"+ letter +" option");
    });
}

function getOptionFlag(flags, flagLetter, defaultValue) {
    if (_.isUndefined(flags))
        return defaultValue;
    return (flags.indexOf(flagLetter) >= 0);
}

function makePrettyPrinter(reportClass) {
    return new subtap.PrettyPrinter(new reportClass(process.stdout, {
        tabSize: options.tabSize,
        styleMode: colorMode,
        minResultsWidth: options.minResultsWidth,
        minResultsMargin: options.minResultsMargin,
        truncateTraceAtPath: childPath,
        showFunctionSource: options.showFunctionSource,
        boldDiffText: boldDiffText,
        colorDiffText: colorDiffText,
        underlineFirstDiff: underlineFirstDiff,
        interleaveDiffs: interleaveDiffs,
        canonical: canonical
    }));
}

function runNextFile() {
    var childOptions = { env: childEnv };
    if (!_.isUndefined(options['node-arg'])) {
        if (_.isArray(options['node-arg']))
            childOptions.execArgv = options['node-arg'];
        else
            childOptions.execArgv = [ options['node-arg'] ];
    }
    var child = fork(childPath, [tapPath], childOptions);
    
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
                    embedExceptions: options.embedExceptions,
                    filePath: filePaths[fileIndex]
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
        clearTimeout(timer); // child may exit without messaging parent
        if (!bailed) {
            if (++fileIndex < filePaths.length)
                return runNextFile();
            if (testNumber === 0)
                exitWithUserError("no subtests found");
            if (selectedTest !== false && selectedTest > testNumber)
                exitWithUserError("test "+ selectedTest +" not found");
        }
        printer.end();
    });
    
    gotPulse = true;
    if (options.timeoutMillis > 0)
        awaitHeartbeat(child);
}

function awaitHeartbeat(child) {
    timer = setTimeout(function() {
        if (!gotPulse) {
            child.kill('SIGKILL');
            var filePath = filePaths[fileIndex];
            if (filePath.indexOf(cwd) === 0)
                filePath = filePath.substr(cwd.length + 1);
            writeErrorMessage(filePath +" timed out after "+
                    options.timeoutMillis +" millis of inactivity");
            process.exit(1);
        }
        gotPulse = false;
        awaitHeartbeat(child);
    }, options.timeoutMillis);
}

function writeErrorMessage(message) {
    process.stdout.write("*** "+ message +" ***\n\n");
}