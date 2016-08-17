/******************************************************************************
BaseReport is the base class for reports to which the PrettyPrinter sends TAP events. Its interface is a test-centric abstraction of the TAP protocol, where a "test" is a grouping of assertions. The implementation is built on LineMaker.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');
var yaml = require('js-yaml');
var xregexp = require('xregexp');
var _ = require('lodash');

var LineMaker = require('../lib/LineMaker');
var helper = require('../lib/helper');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var ROOT_TEST_QUALIFIER = "root"; // qualifier for root-level tests
var REGEX_UNPRINTABLE = xregexp("[\\p{C}\\\\]", 'g');

// see https://upload.wikimedia.org/wikipedia/en/1/15/Xterm_256color_chart.svg

var COLORMAP_16 = {
    'fail': '\x1b[31m', // dark red
    'fail-emph': '\x1b[97m\x1b[101m', // bright white on bright red
    'found': '\x1b[103m', // bright yellow
    'pass': '\x1b[32m', // dark green
    'wanted': '\x1b[106m' // bright cyan
};

var COLORMAP_256 = {
    'fail': '\x1b[31m', // dark red
    'fail-emph': '\x1b[38;5;124m\x1b[48;5;224m', // dark red on light red
    'found': '\x1b[48;5;225m', // light pink
    'pass': '\x1b[38;5;022m', // dark green
    'wanted': '\x1b[48;5;194m' // light green
};

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _tabSize - width of each indentation level in spaces
// _styleMode = degree to which to allow ANSI escape sequences
// _minHighlightWidth - min width of highlighted multiline results
// _highlightMargin - min index of right margin of highlighted multiline results
// _maker - instance of LineMaker used for formatting output

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _depthShown - depth of nested test names that are currently shown
// _rootFailed - whether the containing root-level test has failed

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * @param options
 *   - tabSize: width of each indentation level in spaces
 *   - truncateStackAtPath: Path of file in call stack at which to abbreviate stack to just this path (defaults to null for no truncation)
 *   - styleMode: degree to which to allow ANSI escape sequences. see the LineMaker.STYLE_ constants.
 *   - minHighlightWidth: min width of highlighted multiline results
 *   - highlightMargin: min index of right margin for highlighted multiline results
 *   - writeFunc: Function(text) for outputting generated text; defaults to a function that writes to stdout
*/

function BaseReport(options) {
    options = options || {};
    this._styleMode = options.styleMode || LineMaker.STYLE_ALL;
    this._tabSize = options.tabSize || 2;
    this._minHighlightWidth = options.minHighlightWidth || 40;
    this._highlightMargin = options.highlightMargin || 80;
    this._truncateStackAtPath = options.truncateStackAtPath || null;
    
    this._maker = new LineMaker({
        tabSize: options.tabSize,
        styleMode: options.styleMode,
        colorMap16: COLORMAP_16,
        colorMap256: COLORMAP_256,
        writeFunc: options.writeFunc || function (text) {
            process.stdout.write(text);
        }
    });
    
    this._depthShown = 0;
    this._rootFailed = false;
}
module.exports = BaseReport;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

BaseReport.BULLET_PENDING = '-';
BaseReport.BULLET_FAIL = '⨯';
BaseReport.BULLET_PASS = '✓';

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

BaseReport.prototype.beginTest = function (testStack, testInfo) {
    if (testStack.length === 1)
        this._rootFailed = false;
    else if (testStack.length > 1)
        testInfo.name = "Subtest: "+ testInfo.name;
};

BaseReport.prototype.comment = function (testStack, comment) {
    // ignore by default
};

BaseReport.prototype.extra = function (testStack, extra) {
    // ignore by default
};

BaseReport.prototype.assertionFailed = function (testStack, assert) {
    if (testStack.length > 0) {
        if (!this._rootFailed) {
            this._printUpLine();
            var testInfo = testStack[0];
            var text = this._color('fail', this._bold(BaseReport.BULLET_FAIL));
            text += ' '+ this._color('fail-emph', this._bold(testInfo.name));
            if (testInfo.file)
                text += this._color('fail-emph', testInfo.file);
            this._maker.line(0, text);
            this._depthShown = 1;
        }
        this._rootFailed = true;
    }
    this._printTestContext(testStack);
    var self = this;
    if (this._truncateStackAtPath)
        helper.truncateAssertStacks(assert, this._truncateStackAtPath);
    if (testStack.length === 0)
        this._printFailedAssertion(testStack, 'fail-emph', assert);
    else
        this._printFailedAssertion(testStack, 'fail', assert);
};

BaseReport.prototype.assertionPassed = function (testStack, assert) {
    var text = BaseReport.BULLET_PASS +" "+ this._makeAssertion(assert);
    this._maker.tempLine(testStack.length, text);
};

BaseReport.prototype.closeTest = function (testStack, results) {
    if (this._depthShown === testStack.length)
        --this._depthShown;
};

BaseReport.prototype.closeReport = function (testStack, results, counts) {
    if (counts.failedAssertions === 0)
        this._passedClosing(counts);
    else
        this._failedClosing(counts);
};

BaseReport.prototype.bailout = function (testStack, reason, counts) {
    this._failedClosing(counts);
    this._maker.line(0, this._color('fail',
            BaseReport.BULLET_FAIL +" BAIL OUT! "+ reason));
};

//// PRIVATE METHODS //////////////////////////////////////////////////////////

BaseReport.prototype._color = function (styleID, text) {
    return this._maker.color(styleID, text);
};

BaseReport.prototype._bold = function (text) {
    return this._maker.style('bold', text);
};

BaseReport.prototype._failedClosing = function (counts) {
    // "Failed n of N root tests, n of N assertions"
    var text = "Failed "+
        counts.failedRootTests +" of "+ counts.rootTests +" "+
                ROOT_TEST_QUALIFIER +" tests, "+
        counts.failedAssertions +" of "+ counts.assertions +
                " assertions";
    text = this._bold(this._color('fail', text));
    this._maker.blankLine();
    this._maker.line(0, text);
    this._maker.blankLine();
};

BaseReport.prototype._makeName = function (bullet, testInfo, color) {
    var text = this._bold(bullet +" "+ testInfo.name);
    if (color)
        text = this._color(color, text);
    if (testInfo.file) {
        var file = testInfo.file; // includes preceding space
        if (color)
            file = this._color(color, file);
        text += file;
    }
    return text;
};

BaseReport.prototype._passedClosing = function (counts) {
    // "Passed all N root tests, all N assertions"
    var text = "Passed all "+
        counts.rootTests +" "+ ROOT_TEST_QUALIFIER +" tests, all "+
        counts.assertions +" assertions";
    text = this._bold(this._color('pass', text));
    this._maker.blankLine();
    this._maker.line(0, text);
    this._maker.blankLine();
};

BaseReport.prototype._prepareValue = function (name, value) {
    var type = typeof value;
    switch (type) {
        case 'string':
            if (value === 'undefined' || value === 'null' ||
                    value === 'true' || value === 'false' ||
                    !_.isNaN(_.toNumber(value)))
                return "'"+ value +"'";
            if (value.indexOf("[Function:") === 0 ||
                    value.indexOf("[instanceof:") === 0)
                return '"'+ value.replace('"', '\\"') +'"';
            value = xregexp.replace(value, REGEX_UNPRINTABLE, function(match) {
                switch (match) {
                    case "\n":
                        return match;
                    case "\\":
                        return "\\\\";
                    case "\r":
                        return "\\r";
                    case "\t":
                        return "\\t";
                };
                var charCode = match.charCodeAt(0);
                return "\\u"+ _.padStart(charCode.toString(16), 4, '0');
            });
            return value;

        case 'function':
            var functionLabel = 'Function';
            functionName = '(anonymous)';
            if (value.name)
                functionName = value.name;
            else if (value.constructor && value.constructor.name) {
                if (value.constructor.name !== "Function") {
                    functionLabel = 'instanceof';
                    functionName = value.constructor.name;
                }
            }
            var obj = {};
            obj[functionLabel] = functionName;

            for (var propertyName in value) {
                if (value.hasOwnProperty(propertyName))
                    obj[propertyName] = value[propertyName];
            }
            if (Object.keys(obj).length === 1)
                return '['+ functionLabel +': '+ functionName +']';
            return obj;
    }
    return value;
};

BaseReport.prototype._printDiffs = function (indentLevel, assert) {
    var found = this._prepareValue(null, assert.diag.found);
    if (typeof found === 'object')
        found = JSON.stringify(found, this._prepareValue, "  ");
    else
        found = String(found);
        
    var wanted = this._prepareValue(null, assert.diag.wanted);
    if (typeof wanted === 'object')
        wanted = JSON.stringify(wanted, this._prepareValue, "  ");
    else
        wanted = String(wanted);
        
    var highlightMargin = this._highlightMargin;
    var minHighlightWidth = this._minHighlightWidth;
    var leftParamMargin = indentLevel * this._tabSize;
    var leftValueMargin = leftParamMargin + this._tabSize;
    var paramNameWidth = 8; // length of 'wanted: '
    
    var singleLineWidth = highlightMargin - leftParamMargin - paramNameWidth;
    if (found.length < singleLineWidth && // leave room for initial space
            found.indexOf("\n") === -1 && 
            wanted.length < singleLineWidth &&
            wanted.indexOf("\n") === -1)
    {
        if (this._styleMode > LineMaker.STYLE_MONOCHROME) {
            found = ' '+ found;
            if (found.length < singleLineWidth)
                found += ' ';
        }
        var foundHighlight = this._color('found', found);
        this._maker.line(indentLevel, 'found:  '+ foundHighlight);

        wanted = ' '+ wanted;
        if (wanted.length < singleLineWidth)
            wanted += ' ';
        var wantedHighlight = this._color('wanted', wanted);
        this._maker.line(indentLevel, 'wanted: '+ wantedHighlight);
    }
    else {
        var multilineWidth = highlightMargin - leftValueMargin;
        if (multilineWidth < minHighlightWidth)
            multilineWidth = minHighlightWidth;

        var foundHighlight =
                this._maker.colorWrap('found', found, multilineWidth);
        this._maker.line(indentLevel, 'found: |');
        this._maker.multiline(indentLevel + 1, foundHighlight);
        
        var wantedHighlight =
                this._maker.colorWrap('wanted', wanted, multilineWidth);
        this._maker.line(indentLevel, 'wanted: |');
        this._maker.multiline(indentLevel + 1, wantedHighlight);
    }
    
    delete(assert.diag['found']);
    delete(assert.diag['wanted']);
};

BaseReport.prototype._printFailedAssertion = function (
    testStack, styleID, assert)
{
    var indentLevel = testStack.length;
    var line = this._makeAssertion(assert);
    if (assert.time)
        line += " # time="+ assert.time +"ms";
    line = this._bold(this._color(styleID, line));
    line = this._bold(this._color('fail', BaseReport.BULLET_FAIL +" ")) + line;
    this._maker.line(indentLevel, line);

    if (!_.isUndefined(assert.diag.found))
        this._printDiffs(indentLevel + 1, assert);
    var diagText = yaml.safeDump(assert.diag, {
        indent: this._tabSize
    });
    this._maker.multiline(indentLevel + 1, diagText);
};

BaseReport.prototype._printTestContext = function (testStack) {
    while (this._depthShown < testStack.length) {
        var testInfo = testStack[this._depthShown];
        var formattedName =
                this._makeName(BaseReport.BULLET_PENDING, testInfo);
        this._maker.line(this._depthShown, formattedName);
        ++this._depthShown;
    }
};

BaseReport.prototype._printUpLine = function () {
    this._maker.upLine(); // subclass might override this
};

BaseReport.prototype._makeAssertion = function (assert) {
    var result = (assert.ok ? 'passed' : 'FAILED');
    return result +"."+ assert.id +" - "+ assert.name;
};