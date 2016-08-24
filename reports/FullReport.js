/******************************************************************************
FullReport outputs the name of each test and the pass/fail status of each assertion as the tests are begun and the assertions are performed.
******************************************************************************/

var util = require('util');
var BaseReport = require('./BaseReport');
var callstack = require('../lib/callstack');

function FullReport(outputStream, options) {
    BaseReport.call(this, outputStream, options);
}
util.inherits(FullReport, BaseReport);
module.exports = FullReport;

FullReport.prototype.beginTest = function (subtestStack, testInfo) {
    BaseReport.prototype.beginTest.call(this, subtestStack, testInfo);
    this._printTestContext(subtestStack);
};

FullReport.prototype.assertionFailed = function (subtestStack, assert) {
    callstack.truncateAssertStacks(assert, this._truncateTraceAtPath);
    this._printFailedAssertion(subtestStack, 'fail', assert);
};

FullReport.prototype.assertionPassed = function (subtestStack, assert) {
    this._printTestContext(subtestStack);
    var text = BaseReport.SYMBOL_PASS +" "+ this._makeAssertion(assert);
    this._maker.line(subtestStack.length, text);
};

FullReport.prototype.closeTest = function (subtestStack, results) {
    BaseReport.prototype.closeTest.call(this, subtestStack, results);
    // ignore test results line when showing all tests and assertions
};
