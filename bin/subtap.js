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

var OUTPUT_FORMATS = [ 'all', 'fail', 'json', 'tally', 'tap' ];
var DEFAULT_OUTPUT_FORMAT = 'tally';

//// CONFIGURATION ////////////////////////////////////////////////////////////

// Parse command line arguments and print help if requested

var argv = process.argv.slice(2);
var minimistConfig = {
    alias: {
        b: 'bail',
        c: 'color',
        e: 'log-exceptions',
        f: 'full-functions',
        h: 'help',
        r: 'run',
        t: 'timeout'
    },
    boolean: [ 'b', 'c', 'e', 'f', 'h', 'r' ],
    string: [ 'diffs', 'node-arg', 'width' ],
    default: {
        t: 3000, // heartbeat timeout millis
        tab: 2, // tab size
        diffs: 'BCU', // differences format
        width: '20:80' // <minimum width>:<minimum margin>
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
var outputFormat =
        optionTools.lastOfMutuallyExclusive(options, argv, OUTPUT_FORMATS);
if (outputFormat === null)
    outputFormat = DEFAULT_OUTPUT_FORMAT;
    
// Validate arguments generically where possible


    

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

var selectedTest = options.run;
if (selectedTest === 0 || selectedTest === true)
    exitWithUserError("-r option requires a non-zero test number (e.g. -r42)");

var maxFailedTests = 0; // assume no maximum
if (_.isNumber(options.bail)) {
    maxFailedTests = options.bail;
    options.bail = false;
}

if (options.tab === true || options.tab === 0)
    exitWithUserError("--tab N option requires a tab size N >= 1");
    
var matches = options.width.match(/^(\d+):(\d+)$/);
if (!matches) {
    exitWithUserError(
            "--width=M:N option requires two colon-separated integers");
}
else {
    options.minResultsWidth = parseInt(matches[1]);
    options.minResultsMargin = parseInt(matches[2]);
    if (options.minResultsWidth < 2)
        exitWithUserError("--width=M:N option requires M >= 2");
}

var diffFlags = options.diffs.toUpperCase();
var boldDiffText = optionTools.getFlag(diffFlags, 'B', true);
var colorDiffText = optionTools.getFlag(diffFlags, 'C', true);
var underlineFirstDiff = optionTools.getFlag(diffFlags, 'U', true);
var interleaveDiffs = optionTools.getFlag(diffFlags, 'I', false);
    
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
            if (selectedTest !== false && selectedTest > testNumber)
                exitWithUserError("test "+ selectedTest +" not found");
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