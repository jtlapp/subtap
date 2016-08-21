/******************************************************************************
Runs a single test file in an isolated child process. Takes a single argument containing the path to the node-tap installation to employ.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var Writable = require('stream').Writable;

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

var tap = require(process.argv[2]);

var testMethod = tap.test;
tap.test = function subtapTest(name, extra, cb, deferred) {
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
    if (cb) {
        testMethod.call(this, name, extra, function (t) {
            if (exiting)
                return;
            if (!t._subtapped) {
                t.tearDown(tearDownTest.bind(t));
                t._subtapped = true;
            }
            return runTest(cb.bind(this, t), true);
        }, deferred);
    }
    else
        testMethod.call(this, name, extra, cb, deferred);
};

tap.tearDown(function() {
    process.send({
        event: 'done',
        lastTestNumber: testNumber,
        failedTests: failedTests
    });
});

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
    }, false);
    tap.end();
});

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function tearDownTest() {
    if (!this.passing() && maxFailedTests > 0 &&
            ++failedTests === maxFailedTests)
        this.bailout("Aborted after "+ failedTests +" failed test(s)"); 
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
