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
var optionTools = require("../lib/option_tools");
var callStack = require("../lib/call_stack");

//// CONSTANTS ////////////////////////////////////////////////////////////////

var ENV_DEFAULT_ARGS = 'SUBTAP_ARGS';
var OUTPUT_FORMATS = [ 'all', 'fail', 'json', 'tally', 'tap' ];
var DEFAULT_OUTPUT_FORMAT = 'tally';
var REGEX_VALID_SUBSET = /^\d+(\.\.\d+)?(,(\d+(\.\.\d+)?))*$/;
var REGEX_RANGE_ENDS = /\d+(?!\.)/g;

//// STATE ////////////////////////////////////////////////////////////////////

var filePaths = []; // array of all test files to run
var fileIndex = 0; // index of currently running test file
var testNumber = 0; // number of most-recently output root subtest
var failedTests = 0; // number of tests that have failed
var bailed = false; // whether test file bailed out
var skippingChunks = false; // whether skipping TAP output
var gotPulse; // whether child process was recently active
var timer; // heartbeat timer monitoring child activity

//// CONFIGURATION ////////////////////////////////////////////////////////////

// Parse command line arguments, displaying help if requested.

var argv = [];
if (_.isString(process.env[ENV_DEFAULT_ARGS])) {
    argv = _.trim(process.env[ENV_DEFAULT_ARGS]).split(/ +/);
    if (argv[0] === '')
        argv = [];
}
var argv = argv.concat(process.argv.slice(2));

var minimistConfig = {
    alias: {
        b: 'bail',
        c: 'color',
        d: 'diff',
        e: 'log-exceptions',
        f: 'full-functions',
        h: 'help',
        r: 'run',
        t: 'timeout'
    },
    boolean: [ 'b', 'c', 'd', 'e', 'f', 'h' ],
    string: [ 'mark', 'node-arg', 'r', 'wrap' ],
    default: {
        mark: 'BCR:BC', // how to mark differences
        t: 3000, // heartbeat timeout millis
        tab: 2, // tab size
        wrap: '20:80' // <minimum width>:<minimum margin>
    }
};
var options = minimist(argv, minimistConfig);
// console.log(JSON.stringify(options, null, "  "));
// process.exit(0);

if (options.help) {
    require("../lib/help");
    process.exit(0);
}

optionTools.keepLastOfDuplicates(options, ['node-arg']);
optionTools.applyBooleanOffSwitch(options, minimistConfig);
var outputFormat = optionTools.lastOfMutuallyExclusive(argv, OUTPUT_FORMATS);
if (outputFormat === null)
    outputFormat = DEFAULT_OUTPUT_FORMAT;

// Validate argument values generically where possible

['d', 'e', 'f'].forEach(function (option) {
    if (!_.isBoolean(options[option])) {
        exitWithUserError(
            "-"+ option +" is a boolean switch that doesn't take a value");
    }
});

['b', 'c'].forEach(function (option) {
    if (!_.isBoolean(options[option]) && !_.isInteger(options[option])) {
        exitWithUserError(
            "-"+ option +" is a switch that optionally takes an integer");
    }
});

['t', 'tab'].forEach(function (option) {
    if (!_.isInteger(options[option]))
        exitWithUserError("-"+ option +" must take an integer value");
});

// Get color mode and whether canonicalizing output

var colorMode = options.color;
if (colorMode === true)
    exitWithUserError("-cN option requires a color mode number (e.g. -c1)");
if (colorMode === false)
    colorMode = 2;
if (!(colorMode <= 2 || colorMode >= 10 && colorMode <= 12))
    exitWithUserError("-cN option requires a valid color mode (-h for help)");

var canonical = false;
if (colorMode >= 10) {
    canonical = true;
    colorMode -= 10;
}

// Get maximum number of tests that may fail

var maxFailedTests = 0; // assume no maximum
if (_.isNumber(options.bail)) {
    maxFailedTests = options.bail;
    options.bail = false;
}

// Validate tab size

if (options.tab === 0)
    exitWithUserError("--tab N option requires a tab size N >= 1");
    
// Get the minimum results width and margin
    
var matches = options.wrap.match(/^(\d+):(\d+)$/);
if (!matches) {
    exitWithUserError(
            "--wrap=M:N option requires two colon-separated integers");
}
else {
    options.minResultsWidth = parseInt(matches[1]);
    options.minResultsMargin = parseInt(matches[2]);
    if (options.minResultsWidth < 2)
        exitWithUserError("--wrap=M:N option requires M >= 2");
}

// Validate and retrieve the difference mark flags

options.mark = options.mark.toUpperCase();
if (!/^[BCR_]+(:[BCR_]+)?$/.test(options.mark)) {
    exitWithUserError(
            "--mark flags must be one or more of the characters BCR_");
}
matches = options.mark.match(/[^:]+/g);
if (matches.length === 1)
    matches.push(matches[0]);
var markFlags = matches[options.diff ? 1 : 0];
var boldDiffText = optionTools.getFlag(markFlags, 'B');
var colorDiffText = optionTools.getFlag(markFlags, 'C');
var reverseFirstDiff = optionTools.getFlag(markFlags, 'R');

// Validate the tests to run and determine last test number selected
    
var lastSelectedTest = 0;
if (_.isUndefined(options.run))
    options.run = '';
else {
    if (!REGEX_VALID_SUBSET.test(options.run)) {
        exitWithUserError("-r requires one or more comma-delimited numbers "+
                "or ranges (\"N..M\")");
    }
    var endRanges = options.run.match(REGEX_RANGE_ENDS);
    endRanges.forEach(function (endRange) {
        var selectedTest = parseInt(endRange);
        if (selectedTest === 0)
            exitWithUserError("subtest number 0 is not valid in -r");
        if (selectedTest > lastSelectedTest)
            lastSelectedTest = selectedTest;
    });
}
    
//// TEST RUNNER //////////////////////////////////////////////////////////////

var cwd = process.cwd();
var testFileRegexStr = " \\("+ _.escapeRegExp(cwd) +"/(.+:[0-9]+):";
var childPath = path.resolve(__dirname, "_runfile.js");
var childEnv = (options.bail ? { TAP_BAIL: '1' } : {});

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
    var callInfo = callStack.getDeepestCallInfo(stack);
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

function makePrettyPrinter(reportClass) {
    return new subtap.PrettyPrinter(new reportClass(process.stdout, {
        tabSize: options.tab,
        styleMode: colorMode,
        minResultsWidth: options.minResultsWidth,
        minResultsMargin: options.minResultsMargin,
        truncateTraceAtPath: childPath,
        funcs: options['full-functions'],
        boldDiffText: boldDiffText,
        colorDiffText: colorDiffText,
        reverseFirstDiff: reverseFirstDiff,
        interleaveDiffs: options.diff,
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
                    selectedTests: options.run,
                    failedTests: failedTests,
                    maxFailedTests: maxFailedTests,
                    logExceptions: options['log-exceptions'],
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
            if (lastSelectedTest > 0 && lastSelectedTest > testNumber) {
                var range;
                if (lastSelectedTest === testNumber + 1)
                    range = " "+ lastSelectedTest;
                else
                    range = "s "+ (testNumber + 1) +".."+ lastSelectedTest;
                exitWithUserError("root subtest"+ range +" not found");
            }
        }
        printer.end();
    });
    
    gotPulse = true;
    if (options.timeout > 0)
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
                    options.timeout +" millis of inactivity");
            process.exit(1);
        }
        gotPulse = false;
        awaitHeartbeat(child);
    }, options.timeout);
}

function writeErrorMessage(message) {
    process.stdout.write("*** "+ message +" ***\n\n");
}