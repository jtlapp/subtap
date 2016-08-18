#!/usr/bin/env node

/******************************************************************************
Runs a single test file in an isolated child process.

Command line arguments:
    _runfile <tapPath> <priorTestCount> <cwd> <filePath> <selectedNumber>

<tapPath> - Path to the 'node-tap' module.
<priorTestCount> - Number of root tests run prior to this test file.
<cwd> - Current working directory. (Passed in because it'll be the same for many files, so this is more efficient than making a system call for each file.)
<filePath> - Path to the test file to run.
<selectedNumber> - Number of single test to run, or 0 to run all tests.
******************************************************************************/

//// CONSTANTS ////////////////////////////////////////////////////////////////

var ARG_TAP_PATH = 0;
var ARG_TEST_COUNT = 1;
var ARG_CWD = 2;
var ARG_FILE_PATH = 3;
var ARG_SELECTION = 4;

//// CONFIGURATION ////////////////////////////////////////////////////////////

var argv = process.argv.slice(2);
var priorTestNumber = parseInt(argv[ARG_TEST_COUNT]);
var filePath = argv[ARG_FILE_PATH];
var cwd = argv[ARG_CWD]; // more efficient than making system call
var testFileRegex = new RegExp(" \\("+ escapeRegex(cwd) +"/(.+:[0-9]+):");
var selectedTest = parseInt(argv[ARG_SELECTION]);

//// STATE ////////////////////////////////////////////////////////////////////

var testNumber = priorTestNumber;

//// CUSTOMIZE TAP ////////////////////////////////////////////////////////////

var tap = require(argv[ARG_TAP_PATH]);

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

//// RUN TESTS ////////////////////////////////////////////////////////////////

process.on('beforeExit', function (exitCode) {
    process.stdout.write("# SUBTAP: "+ (testNumber - priorTestNumber) +
            " root tests in "+ filePath +"\n");
});
require(filePath);

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

// include here so we're not loading a module (e.g. lodash) with each call
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
