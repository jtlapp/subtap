/******************************************************************************
Reporters
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var yaml = require('js-yaml');

var ConsoleFormat = require('./lib/ConsoleFormat');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var BULLET_CHAR = '-';
var FAIL_CHAR = '⨯';
var PASS_CHAR = '✓';
var ROOT_TEST_QUALIFIER = "root"; // qualifier for root-level tests

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _writer - Writer stream to which to output prettied text
// _tabSize - number of spaces to use for each indented level
// _format - instance of ConsoleFormat used for formatting output

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// TBD

/******************************************************************************
Reporter
******************************************************************************/

function Reporter(format) {
    this._format = format;
}

Reporter.prototype.putTestName = function (testName) {

};

Reporter.prototype.putFailedAssertion = function (assert) {

};

Reporter.prototype.putPassedAssertion = function (assert) {

};

Reporter.prototype.close = function (counts) {

};
