/******************************************************************************
BaseReport is the base class for reports to which the PrettyPrinter sends TAP events. Its interface is a test-centric abstraction of the TAP protocol, where a "test" is a grouping of assertions. The implementation is built on LineMaker.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');
var yaml = require('js-yaml');
var diff = require('diff');
var xregexp = require('xregexp');
var _ = require('lodash');

var LineMaker = require('../lib/LineMaker');
var callStack = require('../lib/call_stack');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var WANTED_WIDTH = "wanted: ".length;
var LABEL_DIFFS = 'diffs:';
var LABEL_NO_DIFFS = 'noDiffs:';
var PRIMARY_LABELS = ['compare', 'diff', 'diffs', 'found', 'wanted', 'noDiffs',
        'notWanted', 'doNotWant', 'pattern'];
var DIFF_NOTICE = "^ deltas change wanted into found";

var REGEX_STRING_ESC = xregexp('["\\p{C}\\\\]', 'g');
var REGEX_CANONICAL = new RegExp("(\r|\x1b\\[F|\x1b)", 'g');
var REGEX_JS_TERM = "[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*";
var REGEX_FUNCTION_SIG = new RegExp("^function *(?:"+ REGEX_JS_TERM +" *)?"+
        "\\( *(?:"+ REGEX_JS_TERM +"(?:, *"+ REGEX_JS_TERM +")* *)?\\) *\\{");

// see https://upload.wikimedia.org/wikipedia/en/1/15/Xterm_256color_chart.svg
// and https://en.wikipedia.org/wiki/ANSI_escape_code

// 'pass' - style for name of a passing assertion or subtest
// 'root-fail' - style for name of a failed root subtest
// 'fail' - style for other lines reporting errors or failures
// 'found' - style of background for a found value
// 'wanted' - style of background for a wanted value
// 'same' - style of background for a non-differing diff line
// 'bad' - style for marking found text that was not wanted
// 'good' - style for marking wanted text that was not found
// 'label1' - style for a primary YAML label
// 'label2' - style for a secondary YAML label

var COLORMAP_16 = {
    'pass': '\x1b[32m', // dark green text
    'root-fail': '\x1b[97m\x1b[101m', // bright white on bright red background
    'fail': '\x1b[31m', // dark red text
    'found': '\x1b[103m', // bright yellow background
    'wanted': '\x1b[106m', // bright cyan background
    'same': '\x1b[47m', // light gray background
    'bad': '\x1b[31m', // dark red text
    'good': '\x1b[32m', // dark green text
    'label1': '', // default text color
    'label2': '\x1b[90m' // gray text
};

var COLORMAP_256 = {
    'pass': '\x1b[38;5;022m', // dark green text
    'root-fail': '\x1b[38;5;124m\x1b[48;5;224m', // dark red on light red
    'fail': '\x1b[31m', // dark red text
    'found': '\x1b[48;5;225m', // light pink background
    'wanted': '\x1b[48;5;194m', // light green background
    'same': '\x1b[48;5;230m', // light yellow background
    'bad': '\x1b[31m', // dark red text
    'good': '\x1b[38;5;022m', // dark green text
    'label1': '', // default text color
    'label2': '\x1b[38;5;242m' // gray text
};

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _tabSize - width of each indentation level in spaces
// _styleMode = degree to which to allow ANSI escape sequences
// _minResultsWidth - min width at which to wrap failure results area
// _minResultsMargin - min right-margin wrap column for failure results
// _showFunctionSource - whether to output entire source of functions
// _boldDiffText - whether to make the found/wanted text that differs bold
// _colorDiffText - whether to color the found/wanted text that differs
// _reverseFirstCharDiff - whether to reverse-video the first character that differs between found and wanted text
// _reverseFirstLineDiff - whether to reverse-video the first-line difference between found and wanted text
// _interleaveDiffs - whether to interleave differing found/wanted lines
// _minAutoLineNumbering - min count of lines to autonumber, or 0 not to
// _minAutonumberRegex - regex that tests for _minAutoLineNumbering lines
// _maker - instance of LineMaker used for formatting output
// _indent - string of spaces by which to indent each JSON nesting
// _outputStream - stream to which to write output (a node Writable)
// _closeStream - whether to call end() on the output stream

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _depthShown - depth of nested test names that are currently shown
// _rootSubtestFailed - whether the containing root subtest has failed
// _aborting - whether test run was aborted prematurely
// _truncated - whether the report has been truncated

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * @param outputStream Stream to which to write output (a node Writable)
 * @param options
 *   - tabSize: width of each indentation level in spaces
 *   - runfilePath: path to runfile for truncating call stacks (defaults to null for no truncation)
 *   - unstackPaths: array of paths to libraries to truncate from call stacks (defaults to [])
 *   - styleMode: degree to which to allow ANSI escape sequences. see the LineMaker.STYLE_ constants.
 *   - colorOverrides: object mapping style names to escape sequences providing their colors. styles override defaults on a name-by-name basis.
 *   - minResultsWidth: min width at which to wrap failure results area
 *   - minResultsMargin: min right-margin wrap column for failure results
 *   - showFunctionSource: whether to output entire source of functions found in result differences (defaults to false)
 *   - boldDiffText: whether to make the found/wanted text that differs bold (defaults to false)
 *   - colorDiffText: whether to color the found/wanted text that differs
 *   - reverseFirstCharDiff: whether to reverse-video the first character that differs between found and wanted text
*    - reverseFirstLineDiff: whether to reverse-video the first-line difference between found and wanted text
 *   - interleaveDiffs: whether to interleave differing found/wanted lines
 *   - minAutoLineNumbering: minimum number of lines that a wanted or found value must have in order for its lines to automatically be numbered, without line numbers interferring with differences comparisions. 0 disables line numbering. (default 0)
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
    this._runfilePath = options.runfilePath || null;
    this._unstackPaths = options.unstackPaths || [];
    this._showFunctionSource = options.showFunctionSource || false;
    this._boldDiffText = options.boldDiffText,
    this._colorDiffText = options.colorDiffText,
    this._reverseFirstCharDiff = options.reverseFirstCharDiff,
    this._reverseFirstLineDiff = options.reverseFirstLineDiff,
    this._interleaveDiffs = options.interleaveDiffs,
    this._minAutoLineNumbering = options.minAutoLineNumbering || 0,
    this._closeStream = options.closeStream || false;
    
    var self = this;
    this._maker = new LineMaker({
        tabSize: options.tabSize,
        styleMode: options.styleMode,
        colorMap16: COLORMAP_16,
        colorMap256: COLORMAP_256,
        colorOverrides: options.colorOverrides,
        continuation: BaseReport.SYMBOL_CONTINUED,
        writeFunc: function (text) {
            if (options.canonical)
                text = self._canonicalize(text);
            outputStream.write(text);
        }
    });
    this._indent = this._maker.spaces(this._tabSize);
    this._minAutonumberRegex =
            new RegExp('([^\n]*\n|[^\n]+$){'+ this._minAutoLineNumbering +'}');
    
    this._depthShown = 0;
    this._rootSubtestFailed = false;
    this._aborting = false;
    this._truncated = false;
}
module.exports = BaseReport;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

// see https://en.wikibooks.org/wiki/Unicode/List_of_useful_symbols

BaseReport.SYMBOL_PENDING = '-';
BaseReport.SYMBOL_PASS = '✓';
BaseReport.SYMBOL_FAIL = '✗';

BaseReport.SYMBOL_GOOD_LINE = '- '; // '★ ';
BaseReport.SYMBOL_BAD_LINE = '+ '; // '✗ ';

BaseReport.SYMBOL_SPACE = '·';
BaseReport.SYMBOL_NEWLINE = "⏎";
BaseReport.NEWLINE_SUB = BaseReport.SYMBOL_NEWLINE +"\n";
BaseReport.SYMBOL_CONTINUED = '…';
BaseReport.LINE_NUMBER_DELIM = ':';

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

BaseReport.prototype.beginAbort = function (subtestStack, testInfo) {
    this._aborting = true;
};

BaseReport.prototype.beginTest = function (subtestStack, testInfo) {
    if (this._truncated)
        return;
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
    if (this._truncated)
        return;
    if (assert.diag && assert.diag.signal === 'SIGTERM') {
        this._truncated = true;
        return;
    }
    if (subtestStack.length > 0) {
        if (!this._rootSubtestFailed) {
            this._printUpLine();
            var testInfo = subtestStack[0];
            var text = this._color('fail', this._bold(BaseReport.SYMBOL_FAIL));
            text += ' '+ this._color('root-fail', this._bold(testInfo.name));
            if (testInfo.file)
                text += this._color('root-fail', testInfo.file);
            this._maker.line(0, text);
            this._depthShown = 1;
        }
        this._rootSubtestFailed = true;
    }
    this._printTestContext(subtestStack);
    var self = this;
    callStack.truncateAssertStacks(assert, this._runfilePath,
            this._unstackPaths);
    if (subtestStack.length === 0)
        this._printFailedAssertion(subtestStack, 'root-fail', assert);
    else
        this._printFailedAssertion(subtestStack, 'fail', assert);
};

BaseReport.prototype.assertionPassed = function (subtestStack, assert) {
    if (this._truncated)
        return;
    var text = BaseReport.SYMBOL_PASS +" "+ this._makeAssertion(assert);
    this._maker.tempLine(subtestStack.length, text);
};

BaseReport.prototype.closeTest = function (subtestStack, results) {
    if (this._truncated)
        return;
    if (this._depthShown === subtestStack.length)
        --this._depthShown;
};

BaseReport.prototype.closeReport = function (subtestStack, results, counts) {
    if (this._truncated)
        return;
    if (!this._aborting) {
        if (counts.failedAssertions === 0)
            this._passedClosing(counts);
        else
            this._failedClosing(counts);
    }
    if (this._closeStream)
        this._outputStream.end();
};

BaseReport.prototype.bailout = function (subtestStack, reason, counts) {
    if (this._aborting || this._truncated)
        return;
    this._printTestContext(subtestStack);
    var level = subtestStack.length;
    if (/Aborted after \d+ failed/i.test(reason))
        level = 1; // only aborts for failure count of root subtests
    this._maker.line(level, this._bold(this._color('fail',
            BaseReport.SYMBOL_FAIL +" BAIL OUT! "+ reason)));
    this._aborting = true;
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

BaseReport.prototype._createResult = function (label, property, diag) {
    var value = diag[property];
    var type = typeof value;
    
    // Establish whether lines already have or need to get line numbers.
    
    var autonumber = false;
    var lineNumbers = null;
    if (type === 'string') {
        if (typeof diag.lineNumberDelim === 'string') {
            // Temporarily remove line numbers for comparison purposes.
            lineNumbers = [];
            var escLineDelim = _.escapeRegExp(diag.lineNumberDelim);
            var regex = new RegExp("^( *\\d+"+ escLineDelim +")?", 'mg');
            value = value.replace(regex, function (match) {
                lineNumbers.push(match);
                return '';
            });
        }
        else if (this._minAutoLineNumbering > 0)
            autonumber = this._minAutonumberRegex.test(value);
    }
    
    // Assembled a typed value containing metadata about the value.
        
    var result = {
        type: type,
        label: label +':', // add ':' because may later pad with spaces
        val: value,
        autonumber: autonumber,
        lineNumbers: lineNumbers,
        multiline: (type === 'string' && value.indexOf("\n") >= 0),
        property: property
    };
    return result;
};

BaseReport.prototype._colorLabels = function (text) {
    var self= this;
    return text.replace(/^([^: ]+):( *[|>][^\n]*)?/gm, function (match) {
        var label = match.substring(0, match.indexOf(':'));
        if (PRIMARY_LABELS.indexOf(label) >= 0)
            return self._maker.color('label1', match);
        return self._maker.color('label2', match);
    });
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
    this._maker.blankLine(1);
    this._maker.line(0, text);
    this._maker.blankLine(1);
};

BaseReport.prototype._getResultsWidth = function (leftMargin) {
    var rightMargin = this._minResultsMargin;
    if (rightMargin - leftMargin < this._minResultsWidth)
        return this._minResultsWidth;
    return rightMargin - leftMargin;
};

BaseReport.prototype._highlightDiff = function (
        bkgStyleID, styleID, typedValue, diffIndex, diffLength)
{
    // don't allow a trailing LF to be embedded between escape sequences,
    // where LineMaker won't know to strip it for following printed text.
    var value = typedValue.val;
    if (value[value.length - 1] === "\n")
        value = value.substr(0, value.length - 1);

    var s = value.substr(0, diffIndex);
    var diff = value.substr(diffIndex, diffLength);
    var afterDiff = value.substr(diffIndex + diffLength);

    if (diffLength > 0) {
        diff = diff.substr(0, diffLength);
        var reversed = null;
        if (this._reverseFirstLineDiff)
            reversed = diff;
        else if (this._reverseFirstCharDiff) {
            reversed = diff[0];
            if (reversed === "\\")
                reversed += diff[1];
        }
        if (reversed !== null) {
            s += this._colorDiff(styleID,
                    this._maker.style('reverse', reversed));
            diff = diff.substr(reversed.length);
        }
        if (diff.length > 0)
            s += this._color(bkgStyleID, this._colorDiff(styleID, diff));
    }
    if (afterDiff !== '')
        s += this._maker.color(bkgStyleID, afterDiff);
        
    typedValue.val = s;
};

BaseReport.prototype._highlightDiffs = function (
        actual, expected, limitToFirstLine)
{
    // find the index of the first different position, if any

    var baseLength = actual.val.length;
    if (baseLength > expected.val.length)
        baseLength = expected.val.length;
    var diffIndex = 0;
    while (diffIndex < baseLength &&
            actual.val[diffIndex] === expected.val[diffIndex])
        ++diffIndex;
        
    // return early if the values are the same

    if (diffIndex === actual.val.length && diffIndex === expected.val.length)
        return; // values are the same
        
    // determine the ends of the common remainder of the differing lines
    
    var actualIndex = actual.val.indexOf("\n", diffIndex);
    if (!limitToFirstLine || actualIndex < 0)
        actualIndex = actual.val.length;
    var expectedIndex = expected.val.indexOf("\n", diffIndex);
    if (!limitToFirstLine || expectedIndex < 0)
        expectedIndex = expected.val.length;
    
    if (diffIndex < actual.val.length && diffIndex < expected.val.length) {
        while (actual.val[--actualIndex] === expected.val[--expectedIndex])
            ;
    }
    
    // If it is ambiguous whether the changed character is at the start
    // or the end of the sequence, place it at the end.
    
    if (actualIndex < diffIndex - 1)
        expectedIndex += diffIndex - actualIndex - 1;
    else if (expectedIndex < diffIndex - 1)
        actualIndex += diffIndex - expectedIndex - 1;
            
    // highlight text from the point at which it differs
    
    if (diffIndex < actual.val.length && actualIndex >= diffIndex) {
        this._highlightDiff('found', 'bad', actual, diffIndex,
                actualIndex - diffIndex + 1);
    }
    if (diffIndex < expected.val.length && expectedIndex >= diffIndex) {
        this._highlightDiff('wanted', 'good', expected, diffIndex,
                expectedIndex - diffIndex + 1);
    }
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

BaseReport.prototype._normalizeJSON = function (json) {
    return json.replace(/^ *"[^" ]+" *:/gm, function (match) {
        return match.replace(/"/g, ''); // remove quotes from property names
    });
};

BaseReport.prototype._normalizeTypedValue = function (
    typedValue, mustQuoteString, stringifyObject)
{
    var value = typedValue.val;
    typedValue.quoted = false;

    // identify serialized functions and (by default) remove all but signature
    
    var newValue = this._truncateFunction(null, value);
    if (newValue !== value)
        typedValue.type = 'function';
    value = newValue;
    
    // escape string values, quoting them when required
    
    if (typedValue.type === 'string') {
        if (mustQuoteString) {
            value = this._escapeString(value, true, "\\n");
            value = '"'+ value +'"';
            typedValue.quoted = true;
            typedValue.multiline = false;
        }
        else {
            value = this._escapeString(value, false, BaseReport.NEWLINE_SUB);
            var match = value.match(/ +$/);
            if (match) {
                // make trailing spaces visible when not followed by newline
                value = value.substr(0, value.length - match[0].length);
                value += BaseReport.SYMBOL_SPACE.repeat(match[0].length);
            }
            // can't strip trailing LF here; need it for accurate diffing
        }
    }
        
    // normalize object functions, if any, and represent object as a string
    // if so requested

    else if (typedValue.type === 'object') {
        value = JSON.stringify(value, this._truncateFunction, this._indent);
        typedValue.multiline = (value.indexOf("\n") >= 0);
        if (stringifyObject)
            value = this._normalizeJSON(value);
        else
            value = JSON.parse(value); // functions now normalized
    }
    
    // represent all remaining object types as strings
    
    else {
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
    this._maker.blankLine(1);
    this._maker.line(0, text);
    this._maker.blankLine(1);
};

BaseReport.prototype._printDiffLines = function(
        indentLevel, styleID, lineStart, text, typedValue, firstLineIndex)
{
    var leftMargin = indentLevel * this._tabSize; // of indented value
    var resultsWidth = this._getResultsWidth(leftMargin);
    this._maker.multiline(indentLevel, indentLevel,
        this._maker.colorWrap(styleID, text, resultsWidth, 0,
            function (lineIndex) {
                var start = lineStart;
                lineIndex += firstLineIndex;
                if (typedValue.lineNumbers)
                    start += typedValue.lineNumbers[lineIndex];
                else if (typedValue.autonumber)
                    start += String(lineIndex+1) + BaseReport.LINE_NUMBER_DELIM;
                return start;
            },
            '  '+ BaseReport.SYMBOL_CONTINUED
        )
    );
};

BaseReport.prototype._printDiffs = function (indentLevel, assert) {

    // retrieve information about actual and intended results
    
    var actual = this._createResult('found', 'found', assert.diag);
    var expected = null;
    if (!_.isUndefined(assert.diag.wanted))
        expected = this._createResult('wanted', 'wanted', assert.diag);
    else if (!_.isUndefined(assert.diag.doNotWant))
        expected = this._createResult('notWanted', 'doNotWant', assert.diag);

    // output actual value by itself when there is no intended value

    if (!expected) {
        this._normalizeTypedValue(actual, !actual.multiline, true);
        
        if (actual.multiline)
            this._printMultilineValue('found', indentLevel, actual);
        else
            this._printSingleLineValue('found', indentLevel, actual);

        delete(assert.diag[actual.property]);
        return; // short-circuit to reduce subsequent indentation
    }
    
    // determine properties that are a function of both values

    var mustQuoteString = (!actual.multiline && !expected.multiline);
    if (actual.autonumber && expected.autonumber &&
            actual.val !== '' && expected.val !== '')
    {
        actual.autonumber = true;
        expected.autonumber = true;
    }
    
    // output interleaved lines for strings and objects when requested
    
    if (this._interleaveDiffs && actual.type === expected.type &&
            (actual.type === 'string' || actual.type === 'object'))
    {
        this._normalizeTypedValue(actual, false, false);
        this._normalizeTypedValue(expected, false, false);

        this._printInterleavedDiffs(indentLevel, actual, expected);
    }
    
    // otherwise output actual and intended values separately
    
    else {
        this._normalizeTypedValue(actual, mustQuoteString, true);
        this._normalizeTypedValue(expected, mustQuoteString, true);

        if (actual.type === expected.type &&
                (actual.type === 'string' || actual.type === 'object'))
            this._highlightDiffs(actual, expected, false);
        
        if (actual.multiline || expected.multiline) {
            this._printMultilineValue('found', indentLevel, actual);
            this._printMultilineValue('wanted', indentLevel, expected);
        }
        else {
            var labelDiff = actual.label.length - expected.label.length;
            if (labelDiff < 0)
                actual.label += this._maker.spaces(-labelDiff);
            else if (labelDiff > 0)
                expected.label += this._maker.spaces(labelDiff);
            this._printSingleLineValue('found', indentLevel, actual);
            this._printSingleLineValue('wanted', indentLevel, expected);
        }
    }
        
    // delete values from diagnostics so they aren't printed in the YAML
    
    delete(assert.diag[actual.property]);
    delete(assert.diag[expected.property]);
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
        var diag = this._sortPrimaryLabelsFirst(assert.diag);
        var diagText = yaml.safeDump(diag, {
            indent: this._tabSize,
            lineWidth: this._minResultsMargin - indentLevel*this._tabSize
        });
        diagText = this._colorLabels(diagText);
        this._maker.multiline(indentLevel, indentLevel, diagText);
        this._maker.blankLine(1);
    }
};

BaseReport.prototype._printInterleavedDiffs = function(
    indentLevel, actual, expected)
{
    // compute deltas as differences in string representation
    
    var deltas; // deltas are expressed in terms of correcting actual.val
    if (actual.type === 'object') // === expected.type
        deltas = diff.diffJson(expected.val, actual.val);
    else {
        if (actual.val === '' && expected.val === '') {
            // skip out with a shorthand representation
            return this._maker.line(indentLevel,
                    this._maker.color('label1', LABEL_NO_DIFFS) +' '+
                        this._maker.color('same', '""'));
        }
        deltas = diff.diffLines(expected.val, actual.val);
    }
    
    // Use a label that indicates whether there are any differences. Can't
    // compare actual.val === expected.val because different objects may
    // have identical serializations.
    
    var delta = deltas[deltas.length - 1];
    var label = LABEL_DIFFS;
    if (deltas.length === 1 && !delta.added && !delta.removed)
        label = LABEL_NO_DIFFS;

    // Place a proper YAML trailing LF marker, even though it's possible
    // that a prior diff line also does not end with a LF. The presence
    // of a LF is instead indicated via BaseReport.SYMBOL_NEWLINE.

    this._maker.line(indentLevel++,
            this._maker.color('label1', label + this._yamlMark(delta.value)));
    
    // Print the line differences in the string representations. The diff
    // utilities always lists lines removed from the expected value before
    // listing lines from the actual value that replaced them, so if a
    // removal precedes an addition, we can highlight their differences.
    
    var nextDeltaValue = null;
    var expectedLineCount = 0;
    var actualLineCount = 0;
    for (var i = 0; i < deltas.length; ++i) {
        delta = deltas[i];

        var value = nextDeltaValue;
        if (value === null) {
            value = delta.value;
            if (actual.type === 'object') // === expected.type
                value = this._normalizeJSON(value);
        }
        nextDeltaValue = null;

        if (delta.removed) {
            if (i + 1 < deltas.length && deltas[i + 1].added) {
                nextDeltaValue = deltas[i + 1].value;
                if (actual.type === 'object') // === expected.type
                    nextDeltaValue = this._normalizeJSON(nextDeltaValue);
                var partialActual = { val: nextDeltaValue };
                var partialExpected = { val: value };
                this._highlightDiffs(partialActual, partialExpected, true);
                value = partialExpected.val;
                nextDeltaValue = partialActual.val;
            }
            this._printDiffLines(indentLevel, 'wanted',
                      BaseReport.SYMBOL_GOOD_LINE, value,
                      expected, expectedLineCount);
            expectedLineCount += delta.count;
        }
        else if (delta.added) {
            this._printDiffLines(indentLevel, 'found',
                      BaseReport.SYMBOL_BAD_LINE, value,
                      actual, actualLineCount);
            actualLineCount += delta.count;
        }
        else {
            this._printDiffLines(indentLevel, 'same', '  ', value,
                        actual, actualLineCount);
            expectedLineCount += delta.count;
            actualLineCount += delta.count;
        }
    }
    
    // Print a note explaining the notation.
    
    this._maker.line(indentLevel, this._maker.color('label2', DIFF_NOTICE));
};

BaseReport.prototype._printMultilineValue = function (
        styleID, indentLevel, typedValue)
{
    var value = typedValue.val;
    var leftMargin = (indentLevel + 1) * this._tabSize; // of indented value
    var resultsWidth = this._getResultsWidth(leftMargin);
    var text = this._maker.colorWrap(styleID, value, resultsWidth, 0,
        function (lineIndex) {
            if (typedValue.lineNumbers)
                return typedValue.lineNumbers[lineIndex];
            if (typedValue.autonumber)
                return String(lineIndex + 1) + BaseReport.LINE_NUMBER_DELIM;
            return '';
        }
    );
    
    this._maker.line(indentLevel, this._maker.color('label1',
            typedValue.label + this._yamlMark(value)));
    this._maker.multiline(indentLevel + 1, indentLevel + 1, text);
};

BaseReport.prototype._printSingleLineValue = function (
        styleID, indentLevel, typedValue)
{
    var value = typedValue.val;
    var label = typedValue.label +' ';
    var leftMargin = (indentLevel + 1) * this._tabSize; // of indented value
    var resultsWidth = this._getResultsWidth(leftMargin);
    var firstLineWidth = resultsWidth + this._tabSize - label.length;

    if (typedValue.lineNumbers) {
        // A string shows as '123:"source string"', violating YAML, because
        // the line number is not part of the string but must be reported.
        value = typedValue.lineNumbers[0] + value;
    }
    if (this._styleMode > LineMaker.STYLE_MONOCHROME) {
        // make it easier to read short values shown on a background color
        if (!typedValue.quoted) { // quotes already space value from background
            value = ' '+ value;
            if (value.length < firstLineWidth)
                value += this._color(styleID, ' '); // may have \x1b
        }
    }
    this._maker.multiline(indentLevel, indentLevel + 1,
        this._maker.color('label1', label) +
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

BaseReport.prototype._sortPrimaryLabelsFirst = function (diag) {
    var sortedDiag = {};
    var secondaryLabels = {};
    Object.keys(diag).forEach(function (label) {
        if (PRIMARY_LABELS.indexOf(label) >= 0)
            sortedDiag[label] = diag[label];
        else
            secondaryLabels[label] = diag[label];
    });
    Object.keys(secondaryLabels).forEach(function (label) {
        sortedDiag[label] = secondaryLabels[label];
    });
    return sortedDiag;
};

BaseReport.prototype._truncateFunction = function (jsonName, value) {
    if (typeof value !== 'string' || this._showFunctionSource ||
            !REGEX_FUNCTION_SIG.test(value))
        return value;
    return _.trimEnd(value.substr(0, value.indexOf("{")));
};

BaseReport.prototype._yamlMark = function (value) {
    if (value[value.length - 1] === BaseReport.SYMBOL_NEWLINE)
        return ' |';
    return ' |-';
};
