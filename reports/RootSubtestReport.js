/******************************************************************************
RootSubtestReport outputs the pass/fail status of each root-most subtest, along with the details of any assertion that failed within the test. The report does not output the results of passing nested tests, except to reflect those results in the status of the root-most containing subtest. If an assertion fails within a nested test, the report also outputs the names of the containing tests. When all tests pass, the report lists all root-most subtests checkmarks preceding.

As the report runs, it overwrites the current console line with the name of the currently running test or the results of the most recent passing assertion. This serves as feedback to the user that the test is running.
******************************************************************************/

var util = require('util');
var BaseReport = require('./BaseReport');

function RootSubtestReport(outputStream, options) {
    BaseReport.call(this, outputStream, options);
}
util.inherits(RootSubtestReport, BaseReport);
module.exports = RootSubtestReport;

RootSubtestReport.prototype.beginTest = function (subtestStack, testInfo) {
    BaseReport.prototype.beginTest.call(this, subtestStack, testInfo);
    if (subtestStack.length === 1)
        this._printTestContext(subtestStack);
    else {
        this._maker.tempLine(subtestStack.length - 1,
                this._makeName(BaseReport.SYMBOL_PENDING, testInfo));
    }
};

RootSubtestReport.prototype.closeTest = function (subtestStack, results) {
    BaseReport.prototype.closeTest.call(this, subtestStack, results);
    if (subtestStack.length === 1 && !this._rootSubtestFailed) {
        this._printUpLine();
        var line =
            this._makeName(BaseReport.SYMBOL_PASS, subtestStack[0], 'pass');
        this._maker.line(0, line);
    }
};
