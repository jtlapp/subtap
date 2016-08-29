/******************************************************************************
Runs a single test file in an isolated child process. Takes a single argument containing the path to the node-tap installation to employ.

Note: All monkey patches of tap should be done within this file so that they get stripped from stack traces reported in assertion test results.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////
/**/ console.log("*** argv "+ JSON.stringify(process.argv));
var path = require('path');
var Writable = require('stream').Writable;

var tapPath = process.argv[2];
var tap = require(tapPath);
var tapSynonyms = require(path.resolve(tapPath, '../../lib/synonyms.js'));

//// CONSTANTS ////////////////////////////////////////////////////////////////

// these are the object types that the 'deeper' module explicitly handles
var IGNORED_OBJECT_TYPES = [ 'Buffer', 'Date', 'Object', 'RegExp' ];

//// CONFIGURATION ////////////////////////////////////////////////////////////

var selectedTest; // number of single test to run, or 0 to run all tests
var testFileRegex; // regex for pulling test file and line number from Error
var maxFailedTests; // max number of failed tests allowed in parent run
var embedExceptions; // whether to embed exceptions in TAP or end test run

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber; // number of most-recently output root subtest
var failedTests; // number of failed tests so far in parent run
var exiting = false; // true to ignore tap compliants on premature exit

//// INSTALLATION /////////////////////////////////////////////////////////////

var testMethod = tap.test;
tap.test = function subtapRootSubtest(name, extra, cb, deferred) {
    if (exiting)
        return;
    if (!cb) {
        cb = extra; // cb might still be undefined if a TODO
        extra = {};
    }
    if (!deferred) { // if initial registration
        ++testNumber;
        if (selectedTest !== false && testNumber !== selectedTest)
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
        return runTest(cb.bind(this, t), true);
    }, deferred);
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
    }
}));

process.on('message', function (config) {
    testNumber = config.priorTestNumber;
    testFileRegex = new RegExp(config.testFileRegexStr);
    selectedTest = config.selectedTest;
    failedTests = config.failedTests;
    maxFailedTests = config.maxFailedTests;
    embedExceptions = config.embedExceptions;
    
    runTest(function() {
        require(config.filePath);
        
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
        });
    }, false);
    tap.end();
});

process.send({ event: 'ready' });

// forked child won't automatically exit

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

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

function runTest(testFunc, allowExceptionEmbedding) {
    if (allowExceptionEmbedding && embedExceptions)
        return testFunc();
    try {
        return testFunc();
    }
    catch (err) {
        process.send({
            event: 'error',
            stack: err.stack
        });
        exiting = true;
    }
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
