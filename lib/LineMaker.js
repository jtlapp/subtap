/******************************************************************************
LineMaker formats lines for output to a terminal. The class associates style names with escape sequences and conditionally outputs the escape sequences. The client calls LineMaker as if escape sequences were always present, but the following modes determine which sequences are actually included in the output:

LineMaker.STYLE_OFF - don't output any escape sequences that style text
LineMaker.STYLE_MONOCHROME - output sequences for emphasis but not for color
LineMaker.STYLE_ALL - output all escape sequences

The caller identifies escape sequences that are subject to color filtering by calling one of the color methods. STYLE_OFF disables all sequences that are output via either a color method or a style method; color is a kind of style.

For maximum compatibility across consoles, every method that styles text ends in an escape code for turning all styling off. Embedding a concatentation of styled text within an outer style won't apply the outer style across the entire concatenation; the outer style ends with the end of the first nested style.

LineMaker also transparently handles clearing to the end of the line as needed, provided that the caller uses the tempLine() and upLine() methods.

Each of the public methods returns a string. The methods that include the word 'line' in their names are also able to pass this string to a pre-configured function. This allows the caller to use these methods for output as well.

The 'options' parameter of the constructor accepts the following values:

 - tabSize: width of each indentation level in spaces (defaults to 2)
 - styleMode: degree to which to output style escape sequences. see the LineMaker.STYLE_ constants. (defaults to STYLE_ALL)
 - styleMap: object mapping style names to non-coloring escape sequences
 - colorMap16: object mapping style names to color escape sequences available on 16-color terminals (optional)
 - colorMap256: object mapping style names to color escape sequences available on 256-color terminals (optional)
 - colorMap16M: object mapping style names to color escape sequence availables on 16M-color terminals (optional)
 - continuation: string of characters to place at the start of each continuation line of a line that is being wrapped at a width (defaults to empty string)
 - writeFunc: function(line) to call for writing lines, or null (optional)
 
LineMaker preconfigures styles named 'bold', 'inverse', 'normal', and 'underline', which correspond to standard escape sequences.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var colorSupport = require('color-support');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var MAX_SPACES = 512; // max length of a generated string of spaces
var REGEX_ESC_TOKENS = /[^\x1b]+|(\x1b[^a-zA-Z]+[a-zA-Z])+/g;

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _tabSize - width of each indentation level in spaces
// _styleMode - degree to which to allow ANSI escape sequences. see the LineMaker.STYLE_ constants.
// _styleMap - object mapping style names to ANSI escape sequences
// _continuation - string with which to start each wrapped line
// _writeFunc - function(line) to call for writing lines

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _lineIsClear - whether line following cursor is clear of prewritten text
// _upLineCount - number of lines moved up from bottom-most line
// _blanksInARow - number of blank lines output in a row

//// CONSTRUCTION /////////////////////////////////////////////////////////////

function LineMaker(options) {
    this._tabSize = options.tabSize || 2;
    if (typeof options.styleMode === 'undefined')
        this._styleMode = LineMaker.STYLE_ALL;
    else
        this._styleMode = options.styleMode;
    this._continuation = options.continuation || '';
    this._writeFunc = options.writeFunc || null;
    
    this._styleMap = { // common terminal escape sequences
        bold: '\x1b[1m',
        clearEnd: '\x1b[K',
        inverse: '\x1b[7m',
        normal: '\x1b[0m',
        underline: '\x1b[4m',
        upLine: '\x1b[F'
    };
    if (options.styleMap) {
        for (var styleName in options.styleMap)
            this._styleMap[styleName] = options.styleMap[styleName];
    }

    if (this._styleMode > LineMaker.STYLE_MONOCHROME) {
        var colorMap = null;
        if (colorSupport.has16m && options.colorMap16M)
            colorMap = options.colorMap16M;
        else if (colorSupport.has256 && options.colorMap256)
            colorMap = options.colorMap256;
        else if (colorSupport.hasBasic && options.colorMap16)
            colorMap = options.colorMap16;
        else
            this._styleMode = LineMaker.STYLE_MONOCHROME;
        if (colorMap) {
            for (var styleName in colorMap)
                this._styleMap[styleName] = colorMap[styleName];
        }
    }
    
    this._lineIsClear = true;
    this._upLineCount = 0;
    this._blanksInARow = 0;
}
module.exports = LineMaker;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

LineMaker.STYLE_OFF = 0;
LineMaker.STYLE_MONOCHROME = 1;
LineMaker.STYLE_ALL = 2;

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

/**
 * Return a blank line. Also passes the blank line to writeFunc when provided.
 *
 * @param maxBlanksInARow Maximum number of blank lines that can be returned in a row, without intervening calls to print non-blank lines
 */

LineMaker.prototype.blankLine = function (maxBlanksInARow) {
    var blanksInARow = this._blanksInARow;
    if (maxBlanksInARow && this._blanksInARow >= maxBlanksInARow)
        return '';
    var blankLine = this._write(this._eol() + this._lf());
    this._blanksInARow = ++blanksInARow;
    return blankLine;
};

/**
 * Return text styled with the color escape sequence named by styleID. Also passes the styled text to writeFunc when provided.
 *
 * @param styleID Name of style as provided in style/color maps
 * @param text Text to bracket in an escape sequence
 */

LineMaker.prototype.color = function (styleID, text) {
    if (this._styleMode <= LineMaker.STYLE_MONOCHROME)
        return text;
    return this.style(styleID, text);
};

/**
 * Return text styled with the color escape sequence named by styleID, wrapping this text so that no line exceeds the given character width, creating additional lines as necessary. Each resulting line is right-padded with spaces so that the escape sequence applies to a string of exactly 'width' characters. When used with background colors, multiple lines of text appear as if in a colored box.
 *
 * @param styleID Name of style as provided in style/color maps
 * @param text Text to wrap into right-padded lines that are each bracketed in an escape sequence
 * @param width Character-wrapping width and width of each resulting line
 * @param lineStart String with which to start each line prior to wrapping
 * @param firstIndent Number of characters in indentation of first line relative to left margin. If non-zero, the background highlight on the last line of the wrap will end at the end of the text.
 */

LineMaker.prototype.colorWrap = function (
        styleID, text, width, lineStart, firstIndent)
{
    if (this._styleMode <= LineMaker.STYLE_MONOCHROME)
        styleID = null;
    return this._wrap(styleID, text, width, lineStart, firstIndent);
};

/**
 * Return an optionally-indented line that ends in "\n" and that clears to the end of the terminal line if necessary.  Also passes the line to writeFunc when provided.
 *
 * @param level Indentation level, to be multiplied by tabSize
 * @param text Text of line, which must contain neither "\n" nor "\r"
 */

LineMaker.prototype.line = function (level, text) {
    return this._write(this.margin(level) + text + this._eol() + this._lf());
};

/**
 * Return the left margin given by the indicated indentation level. This margin is a string of spaces equal to the level times tabSize.
 *
 * @param level Indentation level
 */

LineMaker.prototype.margin = function (level) {
    return spaces(level * this._tabSize);
};

/**
 * Return an optionally-indented string of lines, each ending in "\n" and clearing to the end of the terminal line as necessary. This method applies the margin and end-of-line escape sequences to each line of a series of lines. Also passes the series of lines to writeFunc when provided.
 *
 * @param firstLevel Indentation level to apply to the first line, multiplied by tabSize
 * @param level Indentation level to apply to each line after the first, multiplied by tabSize
 * @param text Text for a series of one or more lines, which must not contain "\r", but which may contain any number of "\n".
 */

LineMaker.prototype.multiline = function (firstLevel, level, text) {
    var lines = text.split("\n");
    if (lines[lines.length - 1].length === 0)
        lines.pop(); // assume "\n" terminates lines rather than delimits
    
    var self = this;
    var margin = this.margin(level);
    var s = "";
    var firstLine = lines.shift();
    if (firstLine)
        s += this.margin(firstLevel) + firstLine + self._eol() + self._lf();
    lines.forEach(function (line) {
        s += margin + line + self._eol() + self._lf();
    });
    return this._write(s);
};

/**
 * Return a string of the indicated number of spaces. String generation is efficient.
 *
 * @param count Number of spaces to include in the string
 */

LineMaker.prototype.spaces = function (count) {
    return spaces(count);
};

/**
 * Return text styled with the escape sequence named by styleID. Also passes the styled text to writeFunc when provided.
 *
 * @param styleID Name of style as provided in style/color maps
 * @param text Text to bracket in an escape sequence
 */

LineMaker.prototype.style = function (styleID, text) {
    if (this._styleMode === LineMaker.STYLE_OFF)
        return text;
    return this._styleMap[styleID] + text + this._styleMap.normal;
};

/**
 * Return text styled with the escape sequence named by styleID, wrapping this text so that no line exceeds the given character width, creating additional lines as necessary. Each resulting line is right-padded with spaces so that the escape sequence applies to a string of exactly 'width' characters. When used with background colors, multiple lines of text appear as if in a colored box.
 *
 * @param styleID Name of style as provided in style/color maps
 * @param text Text to wrap into right-padded lines that are each bracketed in an escape sequence
 * @param width Character-wrapping width and width of each resulting line
 * @param lineStart String with which to start each line prior to wrapping
 * @param firstIndent Number of characters in indentation of first line relative to left margin. If non-zero, the background highlight on the last line of the wrap will end at the end of the text.
 */

LineMaker.prototype.styleWrap = function (
        styleID, text, width, lineStart, firstIndent)
{
    if (this._styleMode === LineMaker.STYLE_OFF)
        styleID = null;
    return this._wrap(styleID, text, width, lineStart, firstIndent);
};

/**
 * Return an optionally-indented line that ends in "\r" and that clears to the end of the terminal line if necessary (prior to outputting "\r"). Also passes the line to writeFunc when provided.
 *
 * @param level Indentation level, to be multiplied by tabSize
 * @param text Text of line, which must contain neither "\n" nor "\r"
 */

LineMaker.prototype.tempLine = function (level, text) {
    return this._write(this.margin(level) + text + this._eol() + this._cr());
};

/**
 * Return the escape sequence for moving the cursor to the prior line. Also passes the escape sequence to writeFunc when provided.
 */

LineMaker.prototype.upLine = function() {
    this._lineIsClear = false;
    ++this._upLineCount;
    return this._write(this._styleMap.upLine);
};

//// PRIVATE METHODS //////////////////////////////////////////////////////////

LineMaker.prototype._eol = function () {
    return (this._lineIsClear ? '' : this._styleMap.clearEnd);
};

LineMaker.prototype._cr = function() {
    this._lineIsClear = false;
    return "\r";
};

LineMaker.prototype._lf = function() {
    if (this._upLineCount === 0)
        this._lineIsClear = true;
    else {
        --this._upLineCount;
        this._lineIsClear = false;
    }
    return "\n";
};

LineMaker.prototype._wrap = function (
        styleID, text, width, lineStart, firstIndent)
{
    var esc = (styleID !== null ? this._styleMap[styleID] : null);
    width = width || 0;
    lineStart = lineStart || '';
    firstIndent = firstIndent || 0;
    var continuation = spaces(lineStart.length) + this._continuation;
    
    var lines = text.split("\n");
    if (lines[lines.length - 1].length === 0)
        lines.pop(); // assume "\n" terminates lines rather than delimits
    var line;
    var s = '';
    var remainder;
    var split = null;
    var extendLastLine = (firstIndent === 0);

    for (var lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
        line = lineStart + lines[lineIndex];
        if (split && split.carryOverEsc)
            line = split.carryOverEsc + line;
        split = null; // assume no carry over next time
        while (line !== null) {
            if (s !== '')
                s += "\n";
            remainder = null;
            if (width > 0) {
                split = this._wrapLineAtMargin(line, width - firstIndent);
                line = split.nextLine;
                if (split.includesEsc)
                    line += this._styleMap.normal; // end line's escape
                if (esc && split.printedLength < width - firstIndent) {
                    if (split.includesEsc)
                        line += esc; // restart wrapped escape
                    if (extendLastLine || lineIndex < lines.length - 1)
                        line += spaces(width - split.printedLength);
                }
                remainder = split.remainder;
                if (remainder !== null)
                    remainder = continuation + remainder;
                firstIndent = 0;
            }
            if (esc)
                s += esc + line + this._styleMap.normal;
            else
                s += line;
            line = remainder;
        }
    };
    return s;
};

LineMaker.prototype._wrapLineAtMargin = function (line, width) {
    var printedLength = 0; // printed length of line as of splitIndex
    var splitIndex = 0; // index of the remainder to print on the next pass
    var includesEsc = false; // whether split out line contains an esc sequence
    var carryOverEsc = ''; // esc sequence that carries over into the remainder
    
    // parse the line into escape-sequence and non-escape-sequence tokens, and
    // find the index into line at which printedLength equals the width.
    
    var matches = line.match(REGEX_ESC_TOKENS);
    for (var i = 0; printedLength < width && i < matches.length; ++i) {
        var token = matches[i];
        if (token.charAt(0) === "\x1b") {
            splitIndex += token.length;
            carryOverEsc = token;
            includesEsc = true;
        }
        else if (printedLength + token.length <= width) {
            splitIndex += token.length;
            printedLength += token.length;
        }
        else {
            splitIndex += width - printedLength;
            printedLength = width;
        }
    }
    
    // only carry forward escape sequence that follows last style reset

    var lastNormal = carryOverEsc.lastIndexOf(this._styleMap.normal);
    if (lastNormal >= 0) {
        carryOverEsc = carryOverEsc.substr(
                lastNormal + this._styleMap.normal.length);
    }
    
    // if there's a remainder, start it with any still-open escape sequence

    var remainder = line.substr(splitIndex);
    remainder = (remainder.length === 0 ? null : carryOverEsc + remainder);
    carryOverEsc = (carryOverEsc === '' ? null : carryOverEsc);
        
    // return a description of the split
        
    return {
        nextLine: line.substr(0, splitIndex),
        printedLength: printedLength,
        remainder: remainder,
        includesEsc: includesEsc,
        carryOverEsc: carryOverEsc
    };
};

LineMaker.prototype._write = function (text) {
    if (this._writeFunc)
        this._writeFunc(text);
    this._blanksInARow = 0;
    return text;
};

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

var spaces = (function () {
    var SPACES = "    "; // static local
    return function (count) {
        if (count === 0)
            return ''; // a little faster
        if (count > MAX_SPACES) {
            // seems ridiculous, but it's already stopped a blowup
            throw new Error("Excessive space request ( "+ count +
                    " spaces) may indicate error");
        }
        while (SPACES.length < count)
            SPACES += SPACES;
        return SPACES.slice(0, count);
    };
})();
