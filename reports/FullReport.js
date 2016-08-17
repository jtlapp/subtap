/******************************************************************************
FullReport outputs the name of each test and the pass/fail status of each assertion as the tests are begun and the assertions are performed.
******************************************************************************/

var util = require('util');
var BaseReport = require('./BaseReport');
var helper = require('../lib/helper');

function FullReport(printer, options) {
    BaseReport.call(this, printer, options);
}
util.inherits(FullReport, BaseReport);
module.exports = FullReport;

FullReport.prototype.beginTest = function (testStack, testInfo) {
    BaseReport.prototype.beginTest.call(this, testStack, testInfo);
    this._printTestContext(testStack);
};

FullReport.prototype.assertionFailed = function (testStack, assert) {
    helper.truncateAssertStacks(assert, this._truncateStackAtPath);
    this._printFailedAssertion(testStack, 'fail', assert);
};

FullReport.prototype.assertionPassed = function (testStack, assert) {
    this._printTestContext(testStack);
    var text = BaseReport.BULLET_PASS +" "+ this._makeAssertion(assert);
    this._maker.line(testStack.length, text);
};

FullReport.prototype.closeTest = function (testStack, results) {
    BaseReport.prototype.closeTest.call(this, testStack, results);
    // ignore test results line when showing all tests and assertions
};
