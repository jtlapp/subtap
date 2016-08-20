/******************************************************************************
RootTestReport outputs the pass/fail status of each root-most test, along with the details of any assertion that failed within the test. The report does not output the results of passing nested tests, except to reflect those results in the status of the root-most containing test. If an assertion fails within a nested test, the report also outputs the names of the containing tests. When all tests pass, the report lists all root-most tests checkmarks preceding.

As the report runs, it overwrites the current console line with the name of the currently running test or the results of the most recent passing assertion. This serves as feedback to the user that the test is running.
******************************************************************************/

var util = require('util');
var BaseReport = require('./BaseReport');

function RootTestReport(outputStream, options) {
    BaseReport.call(this, outputStream, options);
}
util.inherits(RootTestReport, BaseReport);
module.exports = RootTestReport;

RootTestReport.prototype.beginTest = function (testStack, testInfo) {
    BaseReport.prototype.beginTest.call(this, testStack, testInfo);
    if (testStack.length === 1)
        this._printTestContext(testStack);
    else {
        this._maker.tempLine(testStack.length - 1,
                this._makeName(BaseReport.BULLET_PENDING, testInfo));
    }
};

RootTestReport.prototype.closeTest = function (testStack, results) {
    BaseReport.prototype.closeTest.call(this, testStack, results);
    if (testStack.length === 1 && !this._rootFailed) {
        this._printUpLine();
        var line = this._makeName(BaseReport.BULLET_PASS, testStack[0], 'pass');
        this._maker.line(0, line);
    }
};
