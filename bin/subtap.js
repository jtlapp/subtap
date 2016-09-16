#!/usr/bin/env node

/******************************************************************************
subtap executable command line tool
******************************************************************************/

// To debug, put child on different debug port via --narg=--debug=5859

// At present, subtap only works with tap-parser versions prior to 2.0.0. tap 7.0.0 changed the indentation levels of TAP subtest comments, and tap-parser 2.0.0 requires the new indentation.
// It was an option to upgrade subtap to tap-parser 2.0.0 and force subtap users to use tap 7.0.0 or later, but tap-parser 2.0.0 also interprets bail-outs issued during tear-down as belonging to anonymous tests. It is possible to work around this by having _runfile emit a TAP comment signifying a subtap-specific abort, but then subtap would not properly signal the fact that the test aborted in its --tap output. In order to allow -bN to signal "Bail out!" using --tap, subtap must remain with a pre-2.0.0 tap-parser. 
// subtap therefore tweaks the TAP output received from the version of tap the tests use so that it is compatible with tap-parser 1.2.2. This allows subtap to continue issuing bail-outs for -bN and be compatible with all tap versions.

//// MODULES //////////////////////////////////////////////////////////////////

var Writable = require('stream').Writable;
var MemoryStream = require('memory-streams').WritableStream;
var fs = require('fs');
var resolveModule = require('resolve');
var path = require('path');
var minimist = require('minimist');
var glob = require('glob');
var spawn = require('child_process').spawn;
var yaml = require('js-yaml');
var optionhelp = require('option-help');
var _ = require('lodash');
var nodeCleanup = require('node-cleanup');

var subtap = require("../");
var callStack = require("../lib/call_stack");

//// CONSTANTS ////////////////////////////////////////////////////////////////

var ENV_DEFAULT_ARGS = 'SUBTAP_ARGS';
var ENV_COLOR_FILE = 'SUBTAP_COLOR';
var OUTPUT_FORMATS = [ 'all', 'fail', 'json', 'tally', 'tap' ];
var DEFAULT_OUTPUT_FORMAT = 'tally';
var REGEX_VALID_SUBSET = /^\d+(\.\.\d+)?(,(\d+(\.\.\d+)?))*$/;
var REGEX_RANGE_ENDS = /\d+(?!\.)/g;
var STDIO_DESTINATIONS = [ 'each', 'end', 'mix', 'none' ];
var DEFAULT_DEBUG_PORT = 5858;

//// STATE ////////////////////////////////////////////////////////////////////

var filePaths = []; // array of all test files to run
var fileIndex = 0; // index of currently running test file
var testNumber = 0; // number of most-recently output root subtest
var firstSubtest = true; // whether waiting for first subtest name
var subtestIndent = null; // spaces to further indent subtest names
var failedTests = 0; // number of tests that have failed
var bailed = false; // whether test file bailed out
var skippingChunks = false; // whether skipping TAP output
var gotPulse; // whether child process was recently active
var timer; // heartbeat timer monitoring child activity
var debugPort; // node debugging port, or 0 if not debugging
var debugBreak; // whether breaking at start of each root subtest

var child = null; // currently spawned child process or null
var stderrStream = null; // stream for writing file's stderr channel output
var stdoutStream = null; // stream for writing file's stdout channel output
var savedStdio = []; // array of saved tuples { channel, file, output }

//// CONFIGURATION ////////////////////////////////////////////////////////////

// Parse command line arguments, displaying help if requested.

var argv = [];
if (_.isString(process.env[ENV_DEFAULT_ARGS])) {
    argv = _.trim(process.env[ENV_DEFAULT_ARGS]).split(/ +/);
    if (argv[0] === '')
        argv = [];
}
var argv = argv.concat(process.argv.slice(2));

var configOptions = {
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
    string: [
        'debug',
        'debug-brk',
        'debug-port',
        'mark',
        'narg',
        'r',
        'stderr',
        'stdout',
        'targ',
        'wrap'
    ],
    default: {
        mark: 'BCF:CR', // how to mark differences
        t: 3000, // heartbeat timeout millis
        tab: 2, // tab size
        stderr: 'each',
        stdout: 'end',
        wrap: '20:80' // <minimum width>:<minimum margin>
    }
};
var args = minimist(argv, configOptions);
// console.log(JSON.stringify(args, null, "  "));
// process.exit(0);

if (args.help) {
    require("../lib/help");
    process.exit(0);
}

optionhelp.keepLastOfDuplicates(args, ['narg', 'targ']);
optionhelp.applyBooleanOffSwitch(args, configOptions);
var outputFormat = optionhelp.lastOfMutuallyExclusive(argv, OUTPUT_FORMATS);
if (outputFormat === null)
    outputFormat = DEFAULT_OUTPUT_FORMAT;

// Validate argument values generically where possible

['d', 'e', 'f'].forEach(function (option) {
    if (!_.isBoolean(args[option])) {
        exitWithUserError(
            "-"+ option +" is a boolean switch that doesn't take a value");
    }
});

['b', 'c'].forEach(function (option) {
    if (!_.isBoolean(args[option]) && !_.isInteger(args[option])) {
        exitWithUserError(
            "-"+ option +" is a switch that optionally takes an integer");
    }
});

['t', 'tab'].forEach(function (option) {
    if (!_.isInteger(args[option])) {
        if (option.length > 1)
            option = '-'+ option;
        exitWithUserError("-"+ option +" must take an integer value");
    }
});

// Get color mode and whether canonicalizing output

var colorMode = args.color;
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

// Get color map file, if provided

var cwd = process.cwd();
var colorOverrides = null;
if (_.isString(process.env[ENV_COLOR_FILE])) {
    var colorFilePath = _.trim(process.env[ENV_COLOR_FILE]);
    if (colorFilePath !== '') {
        colorFilePath = path.resolve(cwd, colorFilePath);
        var fileText;
        try {
            fileText = fs.readFileSync(colorFilePath, 'utf8');
        }
        catch (err) {
            exitWithUserError("failed to read color file "+ colorFilePath);
        }
        colorOverrides = yaml.safeLoad(fileText);
    }
}

// Get maximum number of tests that may fail

var maxFailedTests = 0; // assume no maximum
if (_.isNumber(args.bail)) {
    maxFailedTests = args.bail;
    args.bail = false;
}

// Validate tab size

if (args.tab === 0)
    exitWithUserError("--tab N option requires a tab size N >= 1");
    
// Get the minimum results width and margin
    
var matches = args.wrap.match(/^(\d+):(\d+)$/);
if (!matches) {
    exitWithUserError(
            "--wrap=M:N option requires two colon-separated integers");
}
else {
    args.minResultsWidth = parseInt(matches[1]);
    args.minResultsMargin = parseInt(matches[2]);
    if (args.minResultsWidth < 2)
        exitWithUserError("--wrap=M:N option requires M >= 2");
}

// Validate and retrieve the difference mark flags

args.mark = args.mark.toUpperCase();
if (!/^[BCFR_]+(:[BCFR_]+)?$/.test(args.mark)) {
    exitWithUserError(
            "--mark flags must be one or more of the characters BCR_");
}
matches = args.mark.match(/[^:]+/g);
if (matches.length === 1)
    matches.push(matches[0]);
var markFlags = matches[args.diff ? 1 : 0];
var boldDiffText = optionhelp.getFlag(markFlags, 'B');
var colorDiffText = optionhelp.getFlag(markFlags, 'C');
var reverseFirstCharDiff = optionhelp.getFlag(markFlags, 'F');
var reverseFirstLineDiff = optionhelp.getFlag(markFlags, 'R');

// Validate the tests to run and determine last test number selected
    
var lastSelectedTest = 0;
if (_.isUndefined(args.run))
    args.run = '';
else {
    if (!REGEX_VALID_SUBSET.test(args.run)) {
        exitWithUserError("-r requires one or more comma-delimited numbers "+
                "or ranges (\"N..M\")");
    }
    var endRanges = args.run.match(REGEX_RANGE_ENDS);
    endRanges.forEach(function (endRange) {
        var selectedTest = parseInt(endRange);
        if (selectedTest === 0)
            exitWithUserError("subtest number 0 is not valid in -r");
        if (selectedTest > lastSelectedTest)
            lastSelectedTest = selectedTest;
    });
}

// Validate the destinations for stderr and stdout

args.stderr = normalizeStdioOption('stderr', args.stderr);
if (args.stderr[0] === '/') {
    stderrStream = fs.createWriteStream(args.stderr);
    args.stderr = 'file';
}

args.stdout = normalizeStdioOption('stdout', args.stdout);
if (args.stdout[0] === '/') {
    stdoutStream = fs.createWriteStream(args.stdout);
    args.stdout = 'file';
}

// Parse and validate debug switches

var defaultDebugPort = DEFAULT_DEBUG_PORT;
if(!_.isUndefined(args['debug-port'])) {
    defaultDebugPort = parseInt(args['debug-port']);
    if (isNaN(defaultDebugPort))
        exitWithUserError("--debug-port requires a port number");
}
['debug', 'debug-brk'].forEach(function (option) {
    if (_.isUndefined(args[option]))
        args[option] = 0;
    else if (args[option] === '')
        args[option] = defaultDebugPort;
    else {
        args[option] = parseInt(args[option]);
        if (isNaN(args[option]))
            exitWithUserError("--"+ option +" optionally takes a port number");
    }
});
if (args['debug'] !== 0 && args['debug-brk'] !== 0)
    exitWithUserError("can't specify both --debug and --debug-brk");
debugPort = args['debug'] + args['debug-brk']; // at most one is non-zero
if (debugPort)
    args.timeout = 0; // disable timer when debugging
debugBreak = (args['debug-brk'] > 0);

//// TEST RUNNER //////////////////////////////////////////////////////////////

var testFileRegexStr = " \\("+ _.escapeRegExp(cwd) +"/(.+:[0-9]+):";
var childPath = path.resolve(__dirname, "_runfile.js");
var childEnv = {};
Object.keys(process.env).forEach(function (key) {
    childEnv[key] = process.env[key];
});
if (args.bail)
    childEnv.TAP_BAIL = '1';

// Locate the installation of the tap module that these test files will use. We need to tweak loads of this particular installation.

tapPath = resolveModule.sync('tap', { basedir: cwd });
require(tapPath); // throws an exception if tap can't be located

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

if (args._.length === 0) {
    args._.push("test/*.js");
    args._.push("tests/*.js");
}

// Run the test files strictly sequentially so that, for a given set of test files, root subtests have consistent numbers from run-to-run.

args._.forEach(function (pattern) {
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

nodeCleanup(function() {

    // Terminate child if left hanging (e.g. ctrl-c from debugger)
    
    if (child !== null)
        child.kill('SIGKILL');
        
    // Properly end any open writable streams.
    
    printer.end();
    if (stdoutStream !== null)
        stdoutStream.end();
    if (stderrStream !== null)
        stderrStream.end();
        
    // Write any stdout and stderr that was accumulated
    
    if (savedStdio.length > 0)
        writeSavedOutput();
});

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function awaitHeartbeat(child) {
    timer = setTimeout(function() {
        if (!gotPulse) {
            child.kill('SIGKILL');
            var filePath = filePaths[fileIndex];
            if (filePath.indexOf(cwd) === 0)
                filePath = filePath.substr(cwd.length + 1);
            writeErrorMessage(filePath +" timed out after "+
                    args.timeout +" millis of inactivity");
            process.exit(1);
        }
        gotPulse = false;
        awaitHeartbeat(child);
    }, args.timeout);
}

function directChildOutput(dest, childStdio, stdioStream, processStdio) {
    if (dest === 'each' || dest === 'end') {
        stdioStream = new MemoryStream();
        childStdio.pipe(stdioStream);
    }
    else if (dest === 'mix')
        childStdio.pipe(processStdio);
    else if (dest === 'file')
        childStdio.pipe(stdioStream);
    return stdioStream;
}

function exitWithTestError(stack) {
    var callInfo = callStack.getCallSourceInfo(stack);
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
        tabSize: args.tab,
        styleMode: colorMode,
        colorOverrides: colorOverrides,
        minResultsWidth: args.minResultsWidth,
        minResultsMargin: args.minResultsMargin,
        truncateTraceAtPath: childPath,
        funcs: args['full-functions'],
        boldDiffText: boldDiffText,
        colorDiffText: colorDiffText,
        reverseFirstCharDiff: reverseFirstCharDiff,
        reverseFirstLineDiff: reverseFirstLineDiff,
        interleaveDiffs: args.diff,
        canonical: canonical
    }));
}

function normalizeStdioOption(stdio, optionValue) {
    optionValue = String(optionValue).toLowerCase();
    if (STDIO_DESTINATIONS.indexOf(optionValue) >= 0)
        return optionValue;
    if (optionValue[0] !== '/' && optionValue[0] !== '.')
        exitWithUserError("invalid --"+ stdio +" value (-h for help)");
    return path.resolve(cwd, optionValue);
}

function runNextFile() {

    // Spawn a child process to perform the test, with appropriate options.

    var childArgs = [];
    if (!_.isUndefined(args['narg'])) {
        if (_.isArray(args['narg']))
            childArgs = args['narg'];
        else
            childArgs.push(args['narg']);
    }
    if (debugPort > 0)
        childArgs.push('--debug='+ debugPort);
    childArgs.push(childPath);
    if (!_.isUndefined(args['targ'])) {
        if (_.isArray(args['targ']))
            childArgs.concat(args['targ']);
        else
            childArgs.push(args['targ']);
    }
    var childOptions = {
        env: childEnv,
        stdio: ['inherit', 'pipe', 'pipe', 'ipc']
    };
    child = spawn(process.execPath, childArgs, childOptions);
    
    // Buffer or redirect the child stderr and stdout streams.
    
    stdoutStream = directChildOutput(args.stdout, child.stdout, stdoutStream,
                        process.stdout);
    stderrStream = directChildOutput(args.stderr, child.stderr, stderrStream,
                        process.stderr);

    // Install handlers for child process state messages.
    
    child.on('message', function (msg) {
        gotPulse = true;
        switch (msg.event) {
            case 'ready':
                child.send({
                    tapPath: tapPath,
                    priorTestNumber: testNumber,
                    testFileRegexStr: testFileRegexStr,
                    selectedTests: args.run,
                    failedTests: failedTests,
                    maxFailedTests: maxFailedTests,
                    logExceptions: args['log-exceptions'],
                    filePath: filePaths[fileIndex],
                    debugBreak: debugBreak
                });
                break;
            case 'chunk':
                var text = msg.text;
                // console.log("CHUNK ["+ text +"]");
                if (/^ *# Subtest:/.test(text)) {
                    // hack to make tap 7.0.0 compatible with tap-parser 1.2.2,
                    // so subtap doesn't have to enforce a version of tap, and
                    // so subtap can induce a TAP "bail out" for -bN.
                    if (firstSubtest) {
                        if (text.indexOf('#') === 0)
                            subtestIndent = '    ';
                        firstSubtest = false;
                    }
                    if (subtestIndent !== null)
                        text = subtestIndent + text;
                }
                else if (/^bail out!/i.test(text))
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
                child = null;
                testNumber = msg.lastTestNumber;
                failedTests = msg.failedTests;
                break;
        }
    });
    
    // Install handler for completion of the child process.
    
    child.on('exit', function (exitCode) {
        // exitCode == 1 if any test fails, so can't bail run
        clearTimeout(timer); // child may exit without messaging parent
        
        // Output or save stderr and stdout that is not already piped.
        
        stdoutStream =
            saveTestStdio('stdout', args.stdout, process.stdout, stdoutStream);
        stderrStream =
            saveTestStdio('stderr', args.stderr, process.stderr, stderrStream);
        
        // Run the next test if there is another and we haven't bailed.
        
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
/*
        // TBD: commented out pending confirmation that cleanup() works
        
        // Properly end any open writable streams.
        
        printer.end();
        if (stdoutStream !== null)
            stdoutStream.end();
        if (stderrStream !== null)
            stderrStream.end();
            
        // Write any stdout and stderr that was accumulated
        
        if (savedStdio.length > 0)
            writeSavedOutput();
*/
    });
    
    // Begin the heartbeat timeout to catch child hanging.
    
    gotPulse = true;
    if (args.timeout > 0)
        awaitHeartbeat(child);
}

function saveTestStdio(channel, dest, processStdio, stdioStream) {
    if (dest === 'each') {
        writeChildOutput(processStdio, channel, filePaths[fileIndex],
                stdioStream.toString())
        stdioStream = null;
    }
    else if (dest === 'end') {
        savedStdio.push({
            file: filePaths[fileIndex],
            channel: channel,
            output: stdioStream.toString()
        });
        stdioStream = null;
    }
    return stdioStream;
}

function writeErrorMessage(message) {
    process.stdout.write("*** "+ message +" ***\n\n");
}

function writeSavedOutput() {
    var stdio;
    savedStdio.forEach(function (tuple) {
        stdio = (tuple.channel === 'stdout' ? process.stdout : process.stderr);
        writeChildOutput(stdio, tuple.channel, tuple.file, tuple.output);
    });
}

function writeChildOutput(processStdio, channel, filePath, output) {
    if (output.length === 0)
        return;
    processStdio.write("---- BEGIN "+ channel +" ("+ filePath +") ----\n");
    processStdio.write(output);
    if (output[output.length - 1] !== "\n")
        processStdio.write("\n"); // guarantee END starts on a new line
    processStdio.write("---- END "+ channel +" ----\n");
}