/******************************************************************************
Runs a single test file in an isolated child process. Receives configuration via IPC from parent subtap process.

Note: All monkey patches of tap should be done within this file so that they get stripped from stack traces reported in assertion test results.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var path = require('path');
var Writable = require('stream').Writable;
var tap; // caller provides load location
var tapSynonyms; // caller provides load location

//// CONSTANTS ////////////////////////////////////////////////////////////////

// these are the object types that the 'deeper' module explicitly handles
var IGNORED_OBJECT_TYPES = [ 'Buffer', 'Date', 'Object', 'RegExp' ];

var REGEX_SUBSET_RANGES = /\d+\.\.\d+|\d+/g;

//// CONFIGURATION ////////////////////////////////////////////////////////////

var tapLimit; // max char output of tap per chunk for node-tap issue #322
    // array of functions returning true given a test number in its range
var testSelectors = null; 
var testFileRegex; // regex for pulling test file and line number from Error
var maxFailedTests; // max number of failed tests allowed in parent run
var catchExceptions; // whether to catch exceptions in TAP or end test run
var debugBreak; // whether to break at start of each root subtest

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber; // number of most-recently output root subtest
var failedTests; // number of failed tests so far in parent run
var exiting = false; // true to ignore tap compliants on premature exit

//// MAIN /////////////////////////////////////////////////////////////////////

process.on('message', function (msg) {
    switch (msg.event) {
        case 'config':
            configure(msg);
            break;
        case 'input':
            process.emit('promptInput', msg.input);
            break;
    }
});

process.send({ event: 'ready' }); // avoid race condition

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function configure(config) {
    tapLimit = config.tapLimit;
    testNumber = config.priorTestNumber;
    testFileRegex = new RegExp(config.testFileRegexStr);
    failedTests = config.failedTests;
    maxFailedTests = config.maxFailedTests;
    catchExceptions = config.catchExceptions;
    if (config.selectedTests !== '')
        selectTests(config.selectedTests);
    debugBreak = config.debugBreak;
    
    installTapWithPatches(config.tapPath);
    
    runUserCode(function() {
        require(config.filePath);
    }, false);
    
    // installing a tearDown handler induces tap autoend,
    // which sometimes causes tearDown before tests install,
    // so have to install handler *after* registering tests.
    // the handler installs because tap has to wait for all
    // tests by waiting at least until the next tick.
    
    tap.tearDown(function() {
        process.send({
            event: 'done',
            lastTestNumber: testNumber,
            failedTests: failedTests
        });
        // disconnect IPC so can exit when stdout, stderr,
        // child processes, and other resources complete.
        process.disconnect();
    });
    tap.end();
}

function installAssertSynonyms(t, assertName) {
    // adapted from node-tap/lib/assert.js
    tapSynonyms[assertName].forEach(function (s) {
        Object.defineProperty(t, s, {
            value: t[assertName],
            enumerable: false,
            configurable: true,
            writable: true
        });
    });
}

function installTapWithPatches(tapPath) {
    tap = require(tapPath);
    tapSynonyms = require(path.resolve(tapPath, '../../lib/synonyms.js'));

    var testMethod = tap.test;
    tap.test = function subtapRootSubtest(name, extra, cb, deferred) {
        if (exiting)
            return;
        if (!cb) {
            cb = extra; // cb might still be undefined if a TODO
            extra = {};
        }
        if (!deferred) { // if initial registration
            if (!isSelectedTest(++testNumber))
                return;

            name = '['+ testNumber +'] '+ name;
        
            // append file name and line number of test to test name
            var err = new Error();
            var matches = err.stack.match(testFileRegex);
            if (matches !== null)
                name += ' ('+ matches[1] +')';
        }
        if (!cb)
            return testMethod.call(this, name, extra, cb, deferred);

        return testMethod.call(this, name, extra, function (t) {
            if (exiting)
                return;
            if (!t._subtapped) {
                t.tearDown(tearDownTest.bind(t));
                t._subtapped = true;
            }
            return runUserCode(runRootSubtest.bind(this, cb, t), true);
        }, deferred);
    };
    
    var tapEnd = tap.end;
    tap._subtapExtraEnds = 0;
    tap.done = tap.end = function subtapRootEnd(implicit) {
        // allow both subtap and test to call tap.end()
        if (typeof implicit !== 'undefined')
            tapEnd.call(this, implicit);
        else if (!this._explicitEnded || ++this._subtapExtraEnds > 1)
            tapEnd.call(this);
    };

    installTypedAsserts(tap);
    installTypedAsserts(tap.Test.prototype);

    tap.pipe(new Writable({
        write: function(chunk, encoding, done) {
            if (!exiting) {
                process.send({
                    event: 'chunk',
                    text: chunk.toString()
                });
            }
            done();
        },
        highWaterMark: tapLimit
    }));
}

function installTypedAsserts(t) {
    t._overriddenStrictSame = t.strictSame;
    t.strictSame = function subtapStrictSame(f, w, m, e) {
        var objectsFound = [];
        var objectsMade = [];
        f = typifyObject(objectsFound, objectsMade, f);
        w = typifyObject(objectsFound, objectsMade, w);
        return this._overriddenStrictSame(f, w, m, e);
    };

    t._overriddenStrictNotSame = t.strictNotSame;
    t.strictNotSame = function subtapStrictNotSame(f, w, m, e) {
        var objectsFound = [];
        var objectsMade = [];
        f = typifyObject(objectsFound, objectsMade, f);
        w = typifyObject(objectsFound, objectsMade, w);
        return this._overriddenStrictNotSame(f, w, m, e);
    };
    
    installAssertSynonyms(t, 'strictSame');
    installAssertSynonyms(t, 'strictNotSame');
}

function isSelectedTest(testNumber) {
    if (testSelectors === null)
        return true;
    for (var i = 0; i < testSelectors.length; ++i) {
        if (testSelectors[i](testNumber))
            return true;
    }
    return false;
}

function runRootSubtest(rootSubtest, t) {
    if (debugBreak) debugger;
    var promise = rootSubtest(t); // step into here to debug the subtest
    return promise; // now resume debugger to reach next root subtest
}

function runUserCode(testFunc, midTest) {
    if (midTest && catchExceptions)
        return testFunc();
    try {
        var promise = testFunc();
        if (!promise || typeof promise.then !== 'function')
            return promise; // tap may ignore the value in this case
        return promise.catch(function (err) {
            sendError(err); // err can be an Error or a reason string
        });
    }
    catch (err) {
        sendError(err);
    }
}

function selectTests(selectedTests) {
    testSelectors = [];
    var matches = selectedTests.match(REGEX_SUBSET_RANGES);
    matches.forEach(function (range) {
        var endPoints = range.match(/\d+/g);
        var start = parseInt(endPoints[0]);
        var end = (endPoints.length > 1 ? parseInt(endPoints[1]) : start);
        testSelectors.push(function (testNumber) {
            return (testNumber >= start && testNumber <= end);
        });
    });
}

function sendError(err) {
    if (err.stack) {
        var errInfo = {};
        // message, stack, and maybe errno don't show in Object.keys()
        errInfo.message = err.message;
        errInfo.stack = err.stack;
        if (typeof err.errno !== 'undefined')
            errInfo.errno = err.errno;
        Object.keys(err).forEach(function (key) {
            errInfo[key] = err[key];
        });
        process.send({
            event: 'error',
            errInfo: errInfo
        });
    }
    else {
        process.send({
            event: 'rejection',
            reason: err // promise rejection reason
        });
    }
    exiting = true;
    tap.bailout("error"); // subtap ignore tap's bailout output here
}

function tearDownTest() {
    if (!this.passing() && maxFailedTests > 0 &&
            ++failedTests === maxFailedTests)
        this.bailout("Aborted after "+ failedTests +" failed test(s)"); 
}

function typifyObject(objectsFound, objectsMade, obj) {
    var _instanceof_ = obj.constructor.name;
    if (IGNORED_OBJECT_TYPES.indexOf(_instanceof_) >= 0)
        return obj;
    
    var index = objectsFound.indexOf(obj);
    if (index >= 0)
        return objectsMade[index];
        
    var newObject = { _instanceof_: _instanceof_ };
    objectsFound.push(obj);
    objectsMade.push(newObject);
    var value;

    Object.keys(obj).forEach(function (key) {
        value = obj[key];
        if (typeof value === 'object')
            newObject[key] = typifyObject(objectsFound, objectsMade, value);
        else
            newObject[key] = value;
    });
    
    return newObject;
}
