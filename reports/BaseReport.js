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

var REGEX_STRING_ESC = xregexp('["\\p{C}\\\\]', 'g');
var REGEX_CANONICAL = new RegExp("(\r|\x1b\\[F|\x1b)", 'g');
var REGEX_JS_TERM = "[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*";
var REGEX_FUNCTION_SIG = new RegExp("^function *(?:"+ REGEX_JS_TERM +" *)?"+
        "\\( *(?:"+ REGEX_JS_TERM +"(?:, *"+ REGEX_JS_TERM +")* *)?\\) *\\{");
var WANTED_WIDTH = "wanted: ".length;
var EMPH_LABELS = ['diff', 'diffs'];

// see https://upload.wikimedia.org/wikipedia/en/1/15/Xterm_256color_chart.svg

var COLORMAP_16 = {
    'bad': '\x1b[31m', // dark red text
    'fail': '\x1b[31m', // dark red text
    'fail-emph': '\x1b[97m\x1b[101m', // bright white on bright red background
    'found': '\x1b[103m', // bright yellow background
    'good': '\x1b[32m', // dark green text
    'label': '\x1b[90m', // light gray text
    'pass': '\x1b[32m', // dark green text
    'wanted': '\x1b[106m' // bright cyan background
};

var COLORMAP_256 = {
    'bad': '\x1b[31m', // dark red text
    'fail': '\x1b[31m', // dark red text
    'fail-emph': '\x1b[38;5;124m\x1b[48;5;224m', // dark red on light red
    'found': '\x1b[48;5;225m', // light pink background
    'good': '\x1b[38;5;022m', // dark green text
    'label': '\x1b[38;5;242m', // gray text
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

BaseReport.SYMBOL_SPACE = '·';
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

BaseReport.prototype._createResult = function (label, property, value) {
    var result = {
        type: typeof value,
        label: label +':', // add ':' because may later pad with spaces
        val: value,
        property: property
    };
    result.multiline = (result.type === 'string' && value.indexOf("\n") >= 0);
    return result;
};

BaseReport.prototype._deemphRootLabels = function (text) {
    var lines = text.split("\n");
    var out = '';
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];
        if (line.length === 0 || line.charAt(0) === ' ')
            out += line + "\n";
        else {
            var deemphLength = line.indexOf(':');
            if (EMPH_LABELS.indexOf(line.substr(0, deemphLength)) >= 0)
                out += line + "\n";
            else {
                ++deemphLength;
                if (deemphLength + 2 <= line.length) {
                    var c = line.charAt(deemphLength + 1);
                    if (c === '|' || c === '>')
                        deemphLength = line.length;
                }
                out += this._maker.color('label', line.substr(0, deemphLength));
                if (deemphLength < line.length)
                    out += line.substr(deemphLength);
                out += "\n";
            }
        }
    }
    return out;
};

BaseReport.prototype._escapeString = function (
        str, doubleQuotesToo, newlineSubstitute)
{
    return xregexp.replace(str, REGEX_STRING_ESC, function(match) {
        switch (match) {
            case "\n":
                if (newlineSubstitute)
                    return newlineSubstitute;
                return match;
            case '"':
                if (doubleQuotesToo)
                    return '\\"';
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
        bkgStyleID, styleID, typedValue, i)
{
    var s = typedValue.val.substr(0, i);
    var diff = typedValue.val.substr(i);
    var quote = null;
    if (typedValue.quoted) {
        quote = diff[diff.length - 1];
        diff = diff.substr(0, diff.length - 1);
    }
    if (diff.length > 0 && this._underlineFirstDiff) {
        s += this._colorDiff(styleID, this._maker.style('underline', diff[0]));
        diff = this._color(bkgStyleID, diff.substr(1));
    }
    if (diff.length > 0)
        s += this._colorDiff(styleID, diff);
    if (quote)
        s += this._maker.color(bkgStyleID, quote);
    typedValue.val = s;
};

BaseReport.prototype._highlightDiffs = function (actual, intent) {

    // find the index of the first different position, if any

    var baseLength = actual.val.length;
    if (baseLength > intent.val.length)
        baseLength = intent.val.length;
    var i = 0;
    while (i < baseLength && actual.val[i] === intent.val[i])
        ++i;
        
    // return early if the values are the same

    if (i === actual.val.length && i === intent.val.length)
        return; // values are the same
    
    // highlight text from the point at which it differs
    
    if (i < actual.val.length)
        this._highlightDiff('found', 'bad', actual, i);
    if (i < intent.val.length)
        this._highlightDiff('wanted', 'good', intent, i);
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

BaseReport.prototype._normalizeTypedValue = function (typedValue, mustQuote) {
    var value = typedValue.val;
    typedValue.quoted = false;

    // identify serialized functions and (by default) remove all but signature
    
    var newValue = this._truncateFunction(null, value);
    if (newValue !== value)
        typedValue.type = 'function';
    value = newValue;
    
    // escape string values, quoting them when required
    
    if (typedValue.type === 'string') {
        if (mustQuote) {
            value = this._escapeString(value, true, "\\n");
            value = '"'+ value +'"';
            typedValue.quoted = true;
            typedValue.multiline = false;
        }
        else
            value = this._escapeString(value, false, BaseReport.NEWLINE_SUB);
    }
        
    // represent values as strings, truncating functions within JSON

    else {
        if (typedValue.type === 'object')
            value = JSON.stringify(value, this._truncateFunction, this._indent);
        else
            value = String(value);
        typedValue.multiline = (value.indexOf("\n") >= 0);
    }
    typedValue.val = value;
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

    // retrieve information about actual and intended results
    
    var actual = this._createResult('found', 'found', assert.diag.found);
    var intent = null;
    if (!_.isUndefined(assert.diag.wanted))
        intent = this._createResult('wanted', 'wanted', assert.diag.wanted);
    else if (!_.isUndefined(assert.diag.doNotWant)) {
        intent = this._createResult('notWanted', 'doNotWant',
                 assert.diag.doNotWant);
    }

    // normalize found and wanted values to strings
    
    var mustQuote = (actual.type === 'string' && !actual.multiline ||
            intent.type === 'string' && !intent.multiline);
    this._normalizeTypedValue(actual, mustQuote);
    this._normalizeTypedValue(intent, mustQuote);

    // output the value differences in the appropriate display format

    if (!intent) {
        if (actual.multiline)
            this._printMultilineValue('found', indentLevel, actual);
        else
            this._printSingleLineValue('found', indentLevel, actual);
    }
    else if (this._interleaveDiffs && actual.type === intent.type &&
            (actual.type === 'string' || actual.type === 'object')) {
        this._printInterleavedDiffs(indentLevel, actual, intent);
    }
    else {
        if (actual.type === intent.type &&
                (actual.type === 'string' || actual.type === 'object'))
            this._highlightDiffs(actual, intent);
        
        if (actual.multiline)
            this._printMultilineValue('found', indentLevel, actual);
        else {
            if (!intent.multiline) {
                var labelDiff = actual.label.length - intent.label.length;
                if (labelDiff < 0)
                    actual.label += this._maker.spaces(-labelDiff);
                else if (labelDiff > 0)
                    intent.label += this._maker.spaces(labelDiff);
            }
            this._printSingleLineValue('found', indentLevel, actual);
        }

        if (intent.multiline)
            this._printMultilineValue('wanted', indentLevel, intent);
        else
            this._printSingleLineValue('wanted', indentLevel, intent);
    }
        
    // delete values from diagnostics so they aren't printed in the YAML
    
    delete(assert.diag[actual.property]);
    if (intent)
        delete(assert.diag[intent.property]);
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
        diagText = this._deemphRootLabels(diagText);
        this._maker.multiline(indentLevel, indentLevel, diagText);
    }
};

BaseReport.prototype._printInterleavedDiffs = function(
    indentLevel, actual, intent, leftMargin)
{
    // TBD
    console.log("*** interleaving not yet implemented ***");
};

BaseReport.prototype._printMultilineValue = function (
        styleID, indentLevel, typedValue)
{
    var value = typedValue.val;
    var leftMargin = (indentLevel + 1) * this._tabSize; // of indented value
    var resultsWidth = this._getResultsWidth(leftMargin);
    var yamlMark = ' |-';
    if (value[value.length - 1] === "\n") {
        yamlMark = ' |';
        value = value.substr(0, value.length - 1);
    }
    
    if (typedValue.type === 'string') {
        var match = value.match(/( +)((?:\x1b[^a-zA-Z]+[a-zA-Z])*)$/);
        if (match) {
            value = value.substr(0, value.length - match[0].length);
            // make trailing spaces visible
            value += BaseReport.SYMBOL_SPACE.repeat(match[1].length);
            value += match[2]; // trailing escape sequences
        }
    }
    
    this._maker.line(indentLevel, typedValue.label + yamlMark);
    this._maker.multiline(indentLevel + 1, indentLevel + 1,
            this._maker.colorWrap(styleID, value, resultsWidth));
};

BaseReport.prototype._printSingleLineValue = function (
        styleID, indentLevel, typedValue)
{
    var value = typedValue.val;
    var label = typedValue.label +' ';
    var leftMargin = (indentLevel + 1) * this._tabSize; // of indented value
    var resultsWidth = this._getResultsWidth(leftMargin);
    var firstLineWidth = resultsWidth + this._tabSize - label.length;

    if (this._styleMode > LineMaker.STYLE_MONOCHROME) {
        // make it easier to read short values shown on a background color
        if (!typedValue.quoted) { // quotes already space value from background
            value = ' '+ value;
            if (value.length < firstLineWidth)
                value += this._color(styleID, ' '); // may have \x1b
        }
    }
    this._maker.multiline(indentLevel, indentLevel + 1, label +
            this._maker.colorWrap(styleID, value, resultsWidth,
                    resultsWidth - firstLineWidth));
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
