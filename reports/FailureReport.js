/******************************************************************************
FailureReport only outputs the details of failing test assertions, along with the names of the tests that contain these assertions.

As the report runs, it overwrites the current console line with the name of the currently running test or the results of the most recent passing assertion. This serves as feedback to the user that the test is running.
******************************************************************************/

var util = require('util');
var BaseReport = require('./BaseReport');

function FailureReport(printer, options) {
    BaseReport.call(this, printer, options);
}
util.inherits(FailureReport, BaseReport);
module.exports = FailureReport;

FailureReport.prototype.beginTest = function (testStack, testInfo) {
    BaseReport.prototype.beginTest.call(this, testStack, testInfo);
    var formattedName = this._makeName(BaseReport.BULLET_PENDING, testInfo);
    this._maker.tempLine(testStack.length - 1, formattedName);
};

FailureReport.prototype.closeTest = function (testStack, results) {
    BaseReport.prototype.closeTest.call(this, testStack, results);
};

FailureReport.prototype._printUpLine = function () {
    // ignore, because test names aren't pre-written
};
