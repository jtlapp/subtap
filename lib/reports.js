/******************************************************************************
Reports
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');
var yaml = require('js-yaml');
var _ = require('lodash');

var ConsoleFormat = require('./ConsoleFormat');

//// CONSTANTS ////////////////////////////////////////////////////////////////

var ROOT_TEST_QUALIFIER = "root"; // qualifier for root-level tests

var BULLET_PENDING = '-';
var BULLET_FAIL = '⨯';
var BULLET_PASS = '✓';

// see https://upload.wikimedia.org/wikipedia/en/1/15/Xterm_256color_chart.svg

var COLOR_MAP_16 = {
    'fail': '\x1b[31m', // dark red
    'fail-emph': '\x1b[97m\x1b[101m', // bright white on bright red
    'found': '\x1b[103m', // bright yellow
    'pass': '\x1b[32m', // dark green
    'wanted': '\x1b[106m' // bright cyan
};

var COLOR_MAP_256 = {
    'fail': '\x1b[31m', // dark red
    'fail-emph': '\x1b[38;5;124m\x1b[48;5;224m', // dark red on light red
    'found': '\x1b[48;5;225m', // light pink
    'pass': '\x1b[38;5;022m', // dark green
    'wanted': '\x1b[48;5;194m' // light green
};

/******************************************************************************
AbstractReport
******************************************************************************/

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _printer - calling instance of SubtapPrinter
// _options - options provided to report, mostly for ConsoleFormat
// _format - instance of ConsoleFormat used for formatting output

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _depthShown - depth of _printer._testStack for which test names are shown

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/*
options:
 - tabSize: width of each indentation level in spaces
 - clearToEnd: whether to clear to the end of each line after printing
 - monochrome: whether to suppress colors. does not suppress bold.
 - styled: whether to suppress all console escape codes
 - minHighlightWidth: min width of highlighted multiline results
 - highlightMargin: min index of right margin for highlighted multiline results
*/

function AbstractReport(printer, options) {
    this._printer = printer;
    this._options = options;
    this._format = new ConsoleFormat({
        tabSize: options.tabSize,
        clearToEnd: options.clearToEnd,
        monochrome: options.monochrome,
        styled: options.styled,
        colorMap16: COLOR_MAP_16,
        colorMap256: COLOR_MAP_256
    });
    this._depthShown = 0;
}

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

AbstractReport.prototype.beginTest = function (nameParse) {
    if (this._printer._testStack.length > 1)
        nameParse.name = "Subtest: "+ nameParse.name;
};

AbstractReport.prototype.comment = function (comment) {
    // ignore by default
};

AbstractReport.prototype.extra = function (extra) {
    // ignore by default
};

AbstractReport.prototype.assertionFailed = function (assert) {
    throw new Error("assertionFailed() not implemented");
};

AbstractReport.prototype.assertionPassed = function (assert) {
    // ignore by default
};

AbstractReport.prototype.closeTest = function (results) {
    if (this._depthShown === this._printer._testStack.length)
        --this._depthShown;
};

AbstractReport.prototype.closeReport = function (results, counts) {
    if (counts.failedAssertions === 0)
        this._passedClosing(counts);
    else
        this._failedClosing(counts);
};

AbstractReport.prototype.bailout = function (reason, counts) {
    this._failedClosing(counts);
    var line = this._color('fail', BULLET_FAIL +" BAIL OUT! "+ reason);
    this._printLine(0, line);
};

//// PRIVATE METHODS //////////////////////////////////////////////////////////

AbstractReport.prototype._color = function (colorID, text) {
    return this._format.color(colorID, text);
};

AbstractReport.prototype._bold = function (text) {
    return this._format.bold(text);
};

AbstractReport.prototype._failedClosing = function (counts) {
    // "Failed n of N root tests, n of N assertions"
    var text = "Failed "+
        counts.failedRootTests +" of "+ counts.rootTests +" "+
                ROOT_TEST_QUALIFIER +" tests, "+
        counts.failedAssertions +" of "+ counts.assertions +
                " assertions";
    text = this._bold(this._color('fail', text));
    this._printLine();
    this._printLine(0, text +"\n");
};

AbstractReport.prototype._formatName = function (bullet, nameParse, color) {
    var text = this._bold(bullet +" "+ nameParse.name);
    if (color)
        text = this._color(color, text);
    if (nameParse.file) {
        var file = nameParse.file; // includes preceding space
        if (color)
            file = this._color(color, file);
        text += file;
    }
    return text;
};

AbstractReport.prototype._passedClosing = function (counts) {
    // "Passed all N root tests, all N assertions"
    var text = "Passed all "+
        counts.rootTests +" "+ ROOT_TEST_QUALIFIER +" tests, all "+
        counts.assertions +" assertions";
    text = this._bold(this._color('pass', text));
    this._printLine();
    this._printLine(0, text +"\n");
};

AbstractReport.prototype._print = function (text) {
    this._printer._print(text);
};

AbstractReport.prototype._printDiffs = function (indentLevel, assert) {
    if (this._options.monochrome || !this._options.styled)
        return;

    var found = String(assert.diag.found);
    if (typeof assert.diag.found === 'object')
        found = JSON.stringify(assert.diag.found, null, "  ");
    var wanted = String(assert.diag.wanted);
    if (typeof assert.diag.wanted === 'object')
        wanted = JSON.stringify(assert.diag.wanted, null, "  ");
    var highlightMargin = this._options.highlightMargin;
    var minHighlightWidth = this._options.minHighlightWidth;
    var leftParamMargin = indentLevel * this._options.tabSize;
    var leftValueMargin = leftParamMargin + this._options.tabSize;
    var paramNameWidth = 8; // length of 'wanted: '
    
    var singleLineWidth = highlightMargin - leftParamMargin - paramNameWidth;
    if (found.length < singleLineWidth && // leave room for initial space
            found.indexOf("\n") === -1 && 
            wanted.length < singleLineWidth &&
            wanted.indexOf("\n") === -1)
    {
        found = ' '+ found;
        if (found.length < singleLineWidth)
            found += ' ';
        var foundHighlight = this._color('found', found);
        this._printLine(indentLevel, 'found:  '+ foundHighlight);

        wanted = ' '+ wanted;
        if (wanted.length < singleLineWidth)
            wanted += ' ';
        var wantedHighlight = this._color('wanted', wanted);
        this._printLine(indentLevel, 'wanted: '+ wantedHighlight);
    }
    else {
        var multilineWidth = highlightMargin - leftValueMargin;
        if (multilineWidth < minHighlightWidth)
            multilineWidth = minHighlightWidth;

        var foundHighlight =
                this._format.colorWrap('found', found, multilineWidth);
        this._printLine(indentLevel, 'found: >');
        this._print(this._format.multiline(indentLevel + 1, foundHighlight));
        
        var wantedHighlight =
                this._format.colorWrap('wanted', wanted, multilineWidth);
        this._printLine(indentLevel, 'wanted: >');
        this._print(this._format.multiline(indentLevel + 1, wantedHighlight));
    }
    
    delete(assert.diag['found']);
    delete(assert.diag['wanted']);
};

AbstractReport.prototype._printFailedAssertion = function (colorID, assert) {
    var indentLevel = this._printer._testStack.length;
    var line = "FAILED "+ assert.id +" - "+ assert.name;
    if (assert.time)
        line += " # time="+ assert.time +"ms";
    line = this._bold(this._color(colorID, line));
    line = this._bold(this._color('fail', BULLET_FAIL +" ")) + line;
    this._printLine(indentLevel, line);

    if (!_.isUndefined(assert.diag.found))
        this._printDiffs(indentLevel + 1, assert);
    var diagText = yaml.safeDump(assert.diag, {
        indent: this._options.tabSize
    });
    this._print(this._format.multiline(indentLevel + 1, diagText));
};

AbstractReport.prototype._printLine = function (indentLevel, text) {
    if (_.isUndefined(text))
        this._print(this._format.lineEnd() +"\n");
    else
        this._print(this._format.line(indentLevel, text) +"\n");
};

AbstractReport.prototype._printTempLine = function (indentLevel, text) {
    this._print(this._format.line(indentLevel, text) +"\r");
};

AbstractReport.prototype._printTestContext = function () {
    while (this._depthShown < this._printer._testStack.length) {
        var nameParse = this._printer._testStack[this._depthShown];
        var formattedName = this._formatName(BULLET_PENDING, nameParse);
        this._printLine(this._depthShown, formattedName);
        ++this._depthShown;
    }
};

AbstractReport.prototype._printUpLine = function () {
    this._print(ConsoleFormat.UP_LINE);
};

AbstractReport.prototype._simplifyAssertion = function (assert) {
    if (assert.ok)
        throw new Error("Can only abbreviate failed assertions");
    if (assert.diag) {
        this._printer._abbreviateStack(assert.diag);
        if (assert.diag.stack && assert.diag.at)
            delete assert.diag['at'];
    }
    if (assert.diag.found)
        this._printer._abbreviateStack(assert.diag.found);
};

/******************************************************************************
FullReport
******************************************************************************/

function FullReport(printer, formatOptions) {
    AbstractReport.call(this, printer, formatOptions);
}
util.inherits(FullReport, AbstractReport);
exports.FullReport = FullReport;

FullReport.prototype.beginTest = function (nameParse) {
    AbstractReport.prototype.beginTest.call(this, nameParse);
    this._printTestContext();
};

FullReport.prototype.assertionFailed = function (assert) {
    this._simplifyAssertion(assert);
    this._printFailedAssertion('fail', assert);
};

FullReport.prototype.assertionPassed = function (assert) {
    this._printTestContext();
    var text = BULLET_PASS +" passed "+ assert.id +" - "+ assert.name;
    this._printLine(this._printer._testStack.length, text);
};

FullReport.prototype.closeTest = function (results) {
    AbstractReport.prototype.closeTest.call(this, results);
    // ignore test results line when showing all tests and assertions
};

/******************************************************************************
RootTestReport
******************************************************************************/

// _rootFailed - whether the containing root-level test has failed

function RootTestReport(printer, formatOptions) {
    formatOptions.clearToEnd = true;
    AbstractReport.call(this, printer, formatOptions);
}
util.inherits(RootTestReport, AbstractReport);
exports.RootTestReport = RootTestReport;

RootTestReport.prototype.beginTest = function (nameParse) {
    AbstractReport.prototype.beginTest.call(this, nameParse);
    if (this._printer._testStack.length === 1) {
        this._printTestContext();
        this._rootFailed = false;
    }
};

RootTestReport.prototype.assertionFailed = function (assert) {
    if (this._printer._testStack.length > 0) {
        if (!this._rootFailed) {
            this._printUpLine();
            var nameParse = this._printer._testStack[0];
            var text = this._color('fail', this._bold(BULLET_FAIL)) +' ';
            text += this._color('fail-emph', this._bold(nameParse.name));
            if (nameParse.file)
                text += this._color('fail-emph', nameParse.file);
            this._printLine(0, text);
            this._depthShown = 1;
        }
        this._rootFailed = true;
    }
    this._printTestContext();
    var self = this;
    this._simplifyAssertion(assert);
    if (self._printer._testStack.length === 0)
        this._printFailedAssertion('fail-emph', assert);
    else
        this._printFailedAssertion('fail', assert);
};

RootTestReport.prototype.closeTest = function (results) {
    AbstractReport.prototype.closeTest.call(this, results);
    if (this._printer._testStack.length === 1 && !this._rootFailed) {
        this._printUpLine();
        var nameParse = this._printer._testStack[0];
        var formattedName = this._formatName(BULLET_PASS, nameParse, 'pass');
        this._printLine(0, formattedName);
        this._print(this._format.lineEnd() +"\r");
    }
};

/******************************************************************************
FailureReport
******************************************************************************/

function FailureReport(printer, formatOptions) {
    formatOptions.clearToEnd = true;
    AbstractReport.call(this, printer, formatOptions);
}
util.inherits(FailureReport, RootTestReport);
exports.FailureReport = FailureReport;

FailureReport.prototype.beginTest = function (nameParse) {
    AbstractReport.prototype.beginTest.call(this, nameParse);
};

FailureReport.prototype.closeTest = function (results) {
    AbstractReport.prototype.closeTest.call(this, results);
};

FailureReport.prototype._printUpLine = function () {
    // ignore, because test names aren't pre-written
};
