/******************************************************************************
Runs a single test file in an isolated child process. Takes a single argument containing the path to the node-tap installation to employ.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var Writable = require('stream').Writable;

//// CONFIGURATION ////////////////////////////////////////////////////////////

var selectedTest; // number of single test to run, or 0 to run all tests
var testFileRegex; // regex for pulling test file and line number from Error

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber; // number of most-recently output root test

//// CUSTOMIZE TAP ////////////////////////////////////////////////////////////

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
    testMethod.call(this, name, extra, cb, deferred);
};

tap.tearDown(function() {
    process.send({
        event: 'done',
        lastTestNumber: testNumber
    });
    process.exit(0); // forked child must call this explicitly
});

tap.pipe(new Writable({
    write: function(chunk, encoding, done) {
        process.send({
            event: 'chunk',
            text: chunk.toString()
        });
        done();
    }
}));

//// INSTALLATION /////////////////////////////////////////////////////////////

process.on('message', function (config) {
    testNumber = config.priorTestNumber;
    testFileRegex = new RegExp(config.testFileRegexStr);
    selectedTest = config.selectedTest;
    require(config.filePath);
    tap.end();
});

tap.on('bailout', function (reason) {
    process.send({
        event: 'bailout',
        reason: reason
    });
});
