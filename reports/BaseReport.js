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

var REGEX_UNPRINTABLE = xregexp("[\\p{C}\\\\]", 'g');
var REGEX_CANONICAL = new RegExp("(\r|\x1b\\[F|\x1b)", 'g');
var REGEX_JS_TERM = "[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*";
var REGEX_FUNCTION_SIG = new RegExp("^function *(?:"+ REGEX_JS_TERM +" *)?"+
        "\\( *(?:"+ REGEX_JS_TERM +"(?:, *"+ REGEX_JS_TERM +")* *)?\\) *\\{");

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
// _showFunctionSource - whether to output entire source of functions
// _maker - instance of LineMaker used for formatting output
// _outputStream - stream to which to write output (a node Writable)
// _closeStream - whether to call end() on the output stream

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _depthShown - depth of nested test names that are currently shown
// _rootSubtestFailed - whether the containing root subtest has failed
// _bailed - whether the test bailed out

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * @param outputStream Stream to which to write output (a node Writable)
 * @param options
 *   - tabSize: width of each indentation level in spaces
 *   - truncateStackAtPath: Path of file in call stack at which to abbreviate stack to just this path (defaults to null for no truncation)
 *   - styleMode: degree to which to allow ANSI escape sequences. see the LineMaker.STYLE_ constants.
 *   - minHighlightWidth: min width of highlighted multiline results
 *   - highlightMargin: min index of right margin for highlighted multiline results
 *   - showFunctionSource: whether to output entire source of functions found in result differences (defaults to false)
 *   - canonical: whether to visibly render control codes in output (defaults to false)
 *   - closeStream: whether to call end() on the output stream (defaults to false, which is usual for stdout)
*/

function BaseReport(outputStream, options) {
    this._outputStream = outputStream;
    options = options || {};
    this._styleMode = options.styleMode || LineMaker.STYLE_ALL;
    this._tabSize = options.tabSize || 2;
    this._minHighlightWidth = options.minHighlightWidth || 40;
    this._highlightMargin = options.highlightMargin || 80;
    this._truncateStackAtPath = options.truncateStackAtPath || null;
    this._showFunctionSource = options.showFunctionSource || false;
    this._closeStream = options.closeStream || false;
    
    var self = this;
    this._maker = new LineMaker({
        tabSize: options.tabSize,
        styleMode: options.styleMode,
        colorMap16: COLORMAP_16,
        colorMap256: COLORMAP_256,
        writeFunc: function (text) {
            if (options.canonical)
                text = self._canonicalize(text);
            outputStream.write(text);
        }
    });
    
    this._depthShown = 0;
    this._rootSubtestFailed = false;
    this._bailed = false;
}
module.exports = BaseReport;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

BaseReport.BULLET_PENDING = '-';
BaseReport.BULLET_FAIL = '⨯';
BaseReport.BULLET_PASS = '✓';

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

BaseReport.prototype.beginTest = function (subtestStack, testInfo) {
    if (subtestStack.length === 1)
        this._rootSubtestFailed = false;
    else if (subtestStack.length > 1)
        testInfo.name = "Subtest: "+ testInfo.name;
};

BaseReport.prototype.comment = function (subtestStack, comment) {
    // ignore by default
};

BaseReport.prototype.extra = function (subtestStack, extra) {
    // ignore by default
};

BaseReport.prototype.assertionFailed = function (subtestStack, assert) {
    if (subtestStack.length > 0) {
        if (!this._rootSubtestFailed) {
            this._printUpLine();
            var testInfo = subtestStack[0];
            var text = this._color('fail', this._bold(BaseReport.BULLET_FAIL));
            text += ' '+ this._color('fail-emph', this._bold(testInfo.name));
            if (testInfo.file)
                text += this._color('fail-emph', testInfo.file);
            this._maker.line(0, text);
            this._depthShown = 1;
        }
        this._rootSubtestFailed = true;
    }
    this._printTestContext(subtestStack);
    var self = this;
    if (this._truncateStackAtPath)
        helper.truncateAssertStacks(assert, this._truncateStackAtPath);
    if (subtestStack.length === 0)
        this._printFailedAssertion(subtestStack, 'fail-emph', assert);
    else
        this._printFailedAssertion(subtestStack, 'fail', assert);
};

BaseReport.prototype.assertionPassed = function (subtestStack, assert) {
    var text = BaseReport.BULLET_PASS +" "+ this._makeAssertion(assert);
    this._maker.tempLine(subtestStack.length, text);
};

BaseReport.prototype.closeTest = function (subtestStack, results) {
    if (this._depthShown === subtestStack.length)
        --this._depthShown;
};

BaseReport.prototype.closeReport = function (subtestStack, results, counts) {
    if (counts.failedAssertions === 0)
        this._passedClosing(counts);
    else
        this._failedClosing(counts);
    if (this._closeStream)
        this._outputStream.end();
};

BaseReport.prototype.bailout = function (subtestStack, reason, counts) {
    if (!this._bailed) { // only report 1st notice, at informative indentation
        this._printTestContext(subtestStack);
        var level = subtestStack.length;
        if (/Aborted after \d+ failed/i.test(reason))
            level = 1; // only aborts for failure count of root subtests
        this._maker.line(level, this._bold(this._color('fail',
                BaseReport.BULLET_FAIL +" BAIL OUT! "+ reason)));
        this._bailed = true;
    }
};

//// RESTRICTED METHODS ///////////////////////////////////////////////////////

BaseReport.prototype._bold = function (text) {
    return this._maker.style('bold', text);
};

BaseReport.prototype._canonicalize = function(text) {
    return text.replace(REGEX_CANONICAL, function (match) {
        switch (match) {
            case "\r":
                return "\\r\n";
            case "\x1b[F":
                return "\\^";
            case "\x1b":
                return "\\e";
        }
        return match;
    });
};

BaseReport.prototype._color = function (styleID, text) {
    return this._maker.color(styleID, text);
};

BaseReport.prototype._failedClosing = function (counts) {
    // "Failed n of N root subtests, n of N assertions"
    var text = "Failed "+
        counts.failedRootSubtests +" of "+ counts.rootSubtests +
                " root subtests, "+
        counts.failedAssertions +" of "+ counts.assertions +
                " assertions";
    text = this._bold(this._color('fail', text));
    this._maker.blankLine();
    this._maker.line(0, text);
    this._maker.blankLine();
};

BaseReport.prototype._makeAssertion = function (assert) {
    var result = (assert.ok ? 'passed' : 'FAILED');
    return result +"."+ assert.id +" - "+ assert.name;
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

BaseReport.prototype._normalizeFunction = function (jsonName, value) {
    if (!this._showFunctionSource && REGEX_FUNCTION_SIG.test(value))
        return _.trimEnd(value.substr(0, value.indexOf("{")));
    return value;
};

BaseReport.prototype._normalizeString = function (value) {
    if (value === 'undefined' || value === 'null' ||
            value === 'true' || value === 'false' ||
            !_.isNaN(_.toNumber(value)))
        return "'"+ value +"'";
    
    return this._normalizeFunction(null, value);
    /*
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
    */
};

BaseReport.prototype._normalizeValue = function (value) {
    if (typeof value === 'string')
        return this._normalizeString(value);
    return value;
};

BaseReport.prototype._passedClosing = function (counts) {
    // "Passed all N root subtests, all N assertions"
    var text = "Passed all "+
        counts.rootSubtests +" root subtests, all "+
        counts.assertions +" assertions";
    text = this._bold(this._color('pass', text));
    this._maker.blankLine();
    this._maker.line(0, text);
    this._maker.blankLine();
};

BaseReport.prototype._printDiffs = function (indentLevel, assert) {
    var found = this._normalizeValue(assert.diag.found);
    if (typeof found === 'object')
        found = JSON.stringify(found, this._normalizeFunction, "  ");
        
    var wanted = this._normalizeValue(assert.diag.wanted);
    if (typeof wanted === 'object')
        wanted = JSON.stringify(wanted, this._normalizeFunction, "  ");
        
    var leftParamMargin = indentLevel * this._tabSize;
    var paramNameWidth = 8; // length of 'wanted: '
    
    var singleLineWidth =
            this._highlightMargin - leftParamMargin - paramNameWidth;
    if (found.length < singleLineWidth && // leave room for initial space
            found.indexOf("\n") === -1 && 
            wanted.length < singleLineWidth &&
            wanted.indexOf("\n") === -1)
    {
        this._printSingleLineDiffs(indentLevel, found, wanted, singleLineWidth);
    }
    else
        this._printMultiLineDiffs(indentLevel, found, wanted, leftParamMargin);
    
    delete(assert.diag['found']);
    delete(assert.diag['wanted']);
};

BaseReport.prototype._printFailedAssertion = function (
    subtestStack, styleID, assert)
{
    var indentLevel = subtestStack.length;
    var line = this._makeAssertion(assert);
    if (assert.time)
        line += " # time="+ assert.time +"ms";
    line = this._bold(this._color(styleID, line));
    line = this._bold(this._color('fail', BaseReport.BULLET_FAIL +" ")) + line;
    this._maker.line(indentLevel, line);

    if (!_.isUndefined(assert.diag)) { // exceptions may not yield a diag
        if (!_.isUndefined(assert.diag.found))
            this._printDiffs(indentLevel + 1, assert);
        var diagText = yaml.safeDump(assert.diag, {
            indent: this._tabSize
        });
        this._maker.multiline(indentLevel + 1, diagText);
    }
};

BaseReport.prototype._printMultiLineDiffs = function (
        indentLevel, found, wanted, leftParamMargin)
{
    var leftValueMargin = leftParamMargin + this._tabSize;
    var multilineWidth = this._highlightMargin - leftValueMargin;
    if (multilineWidth < this._minHighlightWidth)
        multilineWidth = this._minHighlightWidth;

    var foundHighlight =
            this._maker.colorWrap('found', found, multilineWidth);
    this._maker.line(indentLevel, 'found: |');
    this._maker.multiline(indentLevel + 1, foundHighlight);
    
    var wantedHighlight =
            this._maker.colorWrap('wanted', wanted, multilineWidth);
    this._maker.line(indentLevel, 'wanted: |');
    this._maker.multiline(indentLevel + 1, wantedHighlight);
};

BaseReport.prototype._printSingleLineDiffs = function (
        indentLevel, found, wanted, lineWidth)
{
    if (this._styleMode > LineMaker.STYLE_MONOCHROME) {
        found = ' '+ found;
        if (found.length < lineWidth)
            found += ' ';
        wanted = ' '+ wanted;
        if (wanted.length < lineWidth)
            wanted += ' ';
    }
    var foundHighlight = this._color('found', found);
    this._maker.line(indentLevel, 'found:  '+ foundHighlight);
    var wantedHighlight = this._color('wanted', wanted);
    this._maker.line(indentLevel, 'wanted: '+ wantedHighlight);
};

BaseReport.prototype._printTestContext = function (subtestStack) {
    while (this._depthShown < subtestStack.length) {
        var testInfo = subtestStack[this._depthShown];
        var formattedName =
                this._makeName(BaseReport.BULLET_PENDING, testInfo);
        this._maker.line(this._depthShown, formattedName);
        ++this._depthShown;
    }
};

BaseReport.prototype._printUpLine = function () {
    this._maker.upLine(); // subclass might override this
};
