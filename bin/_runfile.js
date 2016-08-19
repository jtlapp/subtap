/******************************************************************************
Runs a single test file in an isolated child process. Takes a single argument containing the path to the node-tap installation to employ.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var Writable = require('stream').Writable;

//// CONFIGURATION ////////////////////////////////////////////////////////////

var selectedTest; // number of single test to run, or 0 to run all tests
var testFileRegex; // regex for pulling test file and line number from Error
var maxFailedTests; // max number of failed tests allowed in parent run

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber; // number of most-recently output root test
var failedTests; // number of failed tests so far in parent run
var bailed = false; // whether a bailout is in progress

//// INSTALLATION /////////////////////////////////////////////////////////////

var tap = require(process.argv[2]);

var testMethod = tap.test;
tap.test = function subtapTest(name, extra, cb, deferred) {
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
            if (bailed)
                t.endAll();
            else
                return cb(t);
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
    process.exit(0);
});

tap.on('bailout', bailout);

tap.pipe(new Writable({
    write: function(chunk, encoding, done) {
        var chunkStr = chunk.toString();
        // console.log("CHUNK ["+ chunkStr.replace("\n", "\\n") +"]");
        if (bailed) // may get notices for tests that didn't run
            return done();
        if (maxFailedTests > 0 && failedTests === maxFailedTests) {
            if (/ +\.\.\. *$/m.test(chunkStr)) {
                bailout();
                chunkStr += "Bail out! Aborted after "+ failedTests +
                                " failed test(s)\n";
            }
        }
        else if (chunkStr.indexOf("not ok ") === 0)
            ++failedTests;

        process.send({
            event: 'chunk',
            text: chunkStr
        });
        done();
    }
}));

process.on('message', function (config) {
    testNumber = config.priorTestNumber;
    testFileRegex = new RegExp(config.testFileRegexStr);
    selectedTest = config.selectedTest;
    failedTests = config.failedTests;
    maxFailedTests = config.maxFailedTests;
    require(config.filePath);
    tap.end();
});

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function bailout(reason) {
    bailed = true;
    process.send({
        event: 'bailout',
        reason: reason
    });
}
