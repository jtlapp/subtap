//'use strict'; // TBD delete this

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

tap.pipe(new Writable({
    write: function(chunk, encoding, done) {
        process.send({
            event: 'chunk',
            text: chunk.toString()
        });
        done();
    }
}));

/*
class MyWritable extends Writable
{
    constructor(options) {
        super(options);
    }
    
    _write(chunk, encoding, done) {
        process.send({
            event: 'chunk',
            text: chunk.toString()
        });
        done();
    }
    
    end(chunk, encoding, done) {
        super.end(chunk, encoding, done);
        console.log("**** END");
    }
}
tap.pipe(new MyWritable());
*/

//// INSTALLATION /////////////////////////////////////////////////////////////

process.on('message', function (config) {
    testNumber = config.priorTestNumber;
    testFileRegex = new RegExp(config.testFileRegexStr);
    selectedTest = config.selectedTest;
    require(config.filePath);

    setImmediate(function () { // run after all tap nextTicks have depleted
        /**/ return; // TBD setImmediate() runs too soon
        process.send({
            event: 'done',
            lastTestNumber: testNumber
        });
        process.exit(0); // forked child must call this explicitly
    });
});

tap.on('bailout', function (reason) {
    process.send({
        event: 'bailout',
        reason: reason
    });
});

