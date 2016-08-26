/******************************************************************************
BaseReport is the base class for reports to which the PrettyPrinter sends TAP events. Its interface is a test-centric abstraction of the TAP protocol, where a "test" is a grouping of assertions. The implementation is built on LineMaker.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');
var yaml = require('js-yaml');
var xregexp = require('xregexp');
var _ = require('lodash');

var LineMaker = require('../lib/LineMaker');
var callstack = require('../lib/callstack');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var REGEX_UNPRINTABLE = xregexp("[\\p{C}\\\\]", 'g');
var REGEX_CANONICAL = new RegExp("(\r|\x1b\\[F|\x1b)", 'g');
var REGEX_JS_TERM = "[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*";
var REGEX_FUNCTION_SIG = new RegExp("^function *(?:"+ REGEX_JS_TERM +" *)?"+
        "\\( *(?:"+ REGEX_JS_TERM +"(?:, *"+ REGEX_JS_TERM +")* *)?\\) *\\{");
var WANTED_WIDTH = "wanted: ".length;

// see https://upload.wikimedia.org/wikipedia/en/1/15/Xterm_256color_chart.svg

var COLORMAP_16 = {
    'bad': '\x1b[31m', // dark red text
    'fail': '\x1b[31m', // dark red text
    'fail-emph': '\x1b[97m\x1b[101m', // bright white on bright red background
    'found': '\x1b[103m', // bright yellow background
    'good': '\x1b[32m', // dark green text
    'pass': '\x1b[32m', // dark green text
    'wanted': '\x1b[106m' // bright cyan background
};

var COLORMAP_256 = {
    'bad': '\x1b[31m', // dark red text
    'fail': '\x1b[31m', // dark red text
    'fail-emph': '\x1b[38;5;124m\x1b[48;5;224m', // dark red on light red
    'found': '\x1b[48;5;225m', // light pink background
    'good': '\x1b[38;5;022m', // dark green text
    'pass': '\x1b[38;5;022m', // dark green text
    'wanted': '\x1b[48;5;194m' // light green background
};

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _tabSize - width of each indentation level in spaces
// _styleMode = degree to which to allow ANSI escape sequences
// _minResultsWidth - min width at which to wrap failure results area
// _minResultsMargin - min right-margin wrap column for failure results
// _showFunctionSource - whether to output entire source of functions
// _boldDiffText - whether to make the found/wanted text that differs bold
// _colorDiffText - whether to color the found/wanted text that differs
// _underlineFirstDiff - whether to underline the first character that differs between found and wanted text
// _interleaveDiffs - whether to interleave differing found/wanted lines
// _maker - instance of LineMaker used for formatting output
// _indent - string of spaces by which to indent each JSON nesting
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
 *   - truncateTraceAtPath: Path of file in call stack at which to abbreviate stack to just this path (defaults to null for no truncation)
 *   - styleMode: degree to which to allow ANSI escape sequences. see the LineMaker.STYLE_ constants.
 *   - minResultsWidth: min width at which to wrap failure results area
 *   - minResultsMargin: min right-margin wrap column for failure results
 *   - showFunctionSource: whether to output entire source of functions found in result differences (defaults to false)
 *   - boldDiffText: whether to make the found/wanted text that differs bold (defaults to false)
 *   - colorDiffText: whether to color the found/wanted text that differs
 *   - underlineFirstDiff: whether to underline the first character that differs between found and wanted text
 *   - interleaveDiffs: whether to interleave differing found/wanted lines
 *   - canonical: whether to visibly render control codes in output (defaults to false)
 *   - closeStream: whether to call end() on the output stream (defaults to false, which is usual for stdout)
*/

function BaseReport(outputStream, options) {
    this._outputStream = outputStream;
    options = options || {};
    this._styleMode = options.styleMode || LineMaker.STYLE_ALL;
    this._tabSize = options.tabSize || 2;
    this._minResultsWidth = options.minResultsWidth || 20;
    this._minResultsMargin = options.minResultsMargin || 80;
    this._truncateTraceAtPath = options.truncateTraceAtPath || null;
    this._showFunctionSource = options.showFunctionSource || false;
    this._boldDiffText = options.boldDiffText,
    this._colorDiffText = options.colorDiffText,
    this._underlineFirstDiff = options.underlineFirstDiff,
    this._interleaveDiffs = options.interleaveDiffs,
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
    this._indent = this._maker.spaces(this._tabSize);
    
    this._depthShown = 0;
    this._rootSubtestFailed = false;
    this._bailed = false;
}
module.exports = BaseReport;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

BaseReport.SYMBOL_PENDING = '-';
BaseReport.SYMBOL_PASS = '✓';
BaseReport.SYMBOL_FAIL = '✗';

BaseReport.SYMNOL_GOOD_LINE = '→';
BaseReport.SYMNOL_BAD_LINE = '✗';

BaseReport.SYMBOL_NEWLINE = "⏎";
BaseReport.NEWLINE_SUB = BaseReport.SYMBOL_NEWLINE +"\n";

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
            var text = this._color('fail', this._bold(BaseReport.SYMBOL_FAIL));
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
    if (this._truncateTraceAtPath)
        callstack.truncateAssertStacks(assert, this._truncateTraceAtPath);
    if (subtestStack.length === 0)
        this._printFailedAssertion(subtestStack, 'fail-emph', assert);
    else
        this._printFailedAssertion(subtestStack, 'fail', assert);
};

BaseReport.prototype.assertionPassed = function (subtestStack, assert) {
    var text = BaseReport.SYMBOL_PASS +" "+ this._makeAssertion(assert);
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
                BaseReport.SYMBOL_FAIL +" BAIL OUT! "+ reason)));
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

BaseReport.prototype._colorDiff = function (styleID, text) {
    if (this._colorDiffText)
        text = this._maker.color(styleID, text);
    if (this._boldDiffText)
        text = this._bold(text);
    return text;
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

BaseReport.prototype._getResultsWidth = function (leftMargin) {
    var rightMargin = this._minResultsMargin;
    if (rightMargin - leftMargin < this._minResultsWidth)
        return this._minResultsWidth;
    return rightMargin - leftMargin;
};

BaseReport.prototype._highlightDiff = function (
        bkgStyleID, styleID, typedValue, i
) {
    var s = typedValue.val.substr(0, i);
    var diff = typedValue.val.substr(i);
    if (this._underlineFirstDiff) {
        s += this._colorDiff(styleID, this._maker.style('underline', diff[0]));
        diff = this._color(bkgStyleID, diff.substr(1));
    }
    if (diff.length > 0)
        s += this._colorDiff(styleID, diff);
    typedValue.val = s;
};

BaseReport.prototype._highlightDiffs = function (found, wanted) {

    // find the index of the first different position, if any

    var baseLength = found.val.length;
    if (baseLength > wanted.val.length)
        baseLength = wanted.val.length;
    var i = 0;
    while (i < baseLength && found.val[i] === wanted.val[i])
        ++i;
        
    // return early if the values are the same

    if (i === found.val.length && i === wanted.val.length)
        return; // values are the same
    
    // highlight text from the point at which it differs
    
    if (i < found.val.length)
        this._highlightDiff('found', 'bad', found, i);
    if (i < wanted.val.length)
        this._highlightDiff('wanted', 'good', wanted, i);
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

BaseReport.prototype._normalizeValue = function (value, mustQuote) {
    var type = typeof value;
    var quoted = false;

    // identify serialized functions and (by default) remove all but signature
    
    var newVal = this._truncateFunction(null, value);
    if (newVal !== value)
        type = 'function';
    value = newVal;
    
    // quote single-line string values and make all newlines visible in
    // multiline values. because all values that are ambiguously strings or
    // JS-native values (e.g. "undefined") have no newlines, they are quotes,
    // eliminating possibility of ambiguity.
    
    if (type === 'string') {
        if (mustQuote) {
            // in this case, one of the compared strings has no "\n"
            value = value.replace(/\n/g, "\\n");
            value = "'"+ value +"'"; // this value won't contain '
            quoted = true;
        }
        else
            value = value.replace(/\n/g, BaseReport.NEWLINE_SUB);
    }
        
    // represent values as strings, truncating functions within JSON

    if (type === 'object')
        value = JSON.stringify(value, this._truncateFunction, this._indent);
    else
        value = String(value); // okay even if value is a string
        
    return {
        type: type, // JS type that the value represents
        val: value, // a string representation of the value
        quoted: quoted // whether quotes where added to a string value
    };
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

    // normalize found and wanted values to strings
    
    var found = assert.diag.found;
    var wanted = assert.diag.wanted;
    var mustQuote = (typeof found === 'string' && found.indexOf("\n") === -1 ||
            typeof wanted === 'string' && wanted.indexOf("\n") === -1);
    found = this._normalizeValue(found, mustQuote);
    wanted = this._normalizeValue(wanted, mustQuote);

    // output the value differences in the appropriate display format

    if (this._interleaveDiffs && found.type === wanted.type &&
            (found.type === 'string' || found.type === 'object')) {
        this._printInterleavedDiffs(indentLevel, found, wanted);
    }
    else {
        if (found.type === wanted.type &&
                (found.type === 'string' || found.type === 'object'))
            this._highlightDiffs(found, wanted);
        var singleLineFound = (found.val.indexOf("\n") < 0);
        var singleLineWanted = (wanted.val.indexOf("\n") < 0);
        
        var styleID = 'found';
        if (singleLineFound) {
            var label = (singleLineWanted ? 'found:  ' : 'found: ');
            this._printSingleLineValue(label, styleID, indentLevel, found);
        }
        else
            this._printMultilineValue('found:', styleID, indentLevel, found);

        styleID = 'wanted';
        if (singleLineWanted) {
            this._printSingleLineValue('wanted: ', styleID, indentLevel,
                    wanted);
        }
        else
            this._printMultilineValue('wanted:', styleID, indentLevel, wanted);
    }
        
    // delete values from diagnostics so they aren't printed in the YAML
    
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
    line = this._bold(this._color('fail', BaseReport.SYMBOL_FAIL +" ")) + line;
    this._maker.line(indentLevel, line);

    if (!_.isUndefined(assert.diag)) { // exceptions may not yield a diag
        ++indentLevel;
        if (!_.isUndefined(assert.diag.found))
            this._printDiffs(indentLevel, assert);
        var diagText = yaml.safeDump(assert.diag, {
            indent: this._tabSize,
            lineWidth: this._minResultsMargin - indentLevel*this._tabSize
        });
        this._maker.multiline(indentLevel, indentLevel, diagText);
    }
};

BaseReport.prototype._printInterleavedDiffs = function(
    indentLevel, found, wanted, leftMargin)
{
    // TBD
    console.log("*** interleaving not yet implemented ***");
};

BaseReport.prototype._printMultilineValue = function (
        label, styleID, indentLevel, typedValue)
{
    var leftMargin = indentLevel * this._tabSize; // of indented value
    var resultsWidth = this._getResultsWidth(leftMargin);
    var endsWithLF = false;
    if (typedValue.val[typedValue.val.length - 1] === "\n") {
        endsWithLF = true;
        typedValue.val = typedValue.val.substr(0, typedValue.val.length - 1);
    }
    
    this._maker.line(indentLevel, label + (endsWithLF ? ' |' : ' |-'));
    this._maker.multiline(indentLevel + 1, indentLevel + 1,
            this._maker.colorWrap(styleID, typedValue.val, resultsWidth));
};

BaseReport.prototype._printSingleLineValue = function (
        label, styleID, indentLevel, typedValue)
{
    var leftMargin = (indentLevel + 1) * this._tabSize; // of indented value
    var resultsWidth = this._getResultsWidth(leftMargin);
    var firstLineWidth = resultsWidth + this._tabSize - label.length;

    if (this._styleMode > LineMaker.STYLE_MONOCHROME) {
        // make it easier to read short values shown on a background color
        if (!typedValue.quoted) { // quotes already space value from background
            typedValue.val = ' '+ typedValue.val;
            if (typedValue.val.length < firstLineWidth)
                typedValue.val += this._color(styleID, ' '); // may have \x1b
        }
    }
    this._maker.multiline(indentLevel, indentLevel + 1, label +
            this._maker.colorWrap(styleID, typedValue.val, resultsWidth,
                    label.length));
};

BaseReport.prototype._printTestContext = function (subtestStack) {
    while (this._depthShown < subtestStack.length) {
        var testInfo = subtestStack[this._depthShown];
        var formattedName =
                this._makeName(BaseReport.SYMBOL_PENDING, testInfo);
        this._maker.line(this._depthShown, formattedName);
        ++this._depthShown;
    }
};

BaseReport.prototype._printUpLine = function () {
    this._maker.upLine(); // subclass might override this
};

BaseReport.prototype._truncateFunction = function (jsonName, value) {
    if (typeof value !== 'string' || this._showFunctionSource ||
            !REGEX_FUNCTION_SIG.test(value))
        return value;
    return _.trimEnd(value.substr(0, value.indexOf("{")));
};
