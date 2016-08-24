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
 - writeFunc: function(line) to call for writing lines, or null (optional)
 
LineMaker preconfigures styles named 'bold', 'inverse', 'normal', and 'underline', which correspond to standard escape sequences.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var colorSupport = require('color-support');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var MAX_SPACES = 512; // max length of a generated string of spaces
var REGEX_ESCAPE_SEQ = /(\x1b[^a-zA-Z]+[a-zA-Z])+/g;
var REGEX_UNBROKEN_ESCAPES = /^(?:[^\x1b]+|\x1b[^a-zA-Z]+[a-zA-Z])*/;
var CONTINUED_CHAR = "…";

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _tabSize - width of each indentation level in spaces
// _styleMode - degree to which to allow ANSI escape sequences. see the LineMaker.STYLE_ constants.
// _styleMap - object mapping style names to ANSI escape sequences
// _writeFunc - function(line) to call for writing lines

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _lineIsClear - whether line following cursor is clear of prewritten text
// _upLineCount - number of lines moved up from bottom-most line

//// CONSTRUCTION /////////////////////////////////////////////////////////////

function LineMaker(options) {
    this._tabSize = options.tabSize || 2;
    if (typeof options.styleMode === 'undefined')
        this._styleMode = LineMaker.STYLE_ALL;
    else
        this._styleMode = options.styleMode;
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
}
module.exports = LineMaker;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

LineMaker.STYLE_OFF = 0;
LineMaker.STYLE_MONOCHROME = 1;
LineMaker.STYLE_ALL = 2;

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

/**
 * Return a blank line. Also passes the blank line to writeFunc when provided.
 */

LineMaker.prototype.blankLine = function () {
    return this._write(this._eol() + this._lf());
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
 * @param firstIndent Number of characters in indentation of first line relative to left margin. If non-zero, the background highlight on the last line of the wrap will end at the end of the text.
 * @param width Character-wrapping width and width of each resulting line
 */

LineMaker.prototype.colorWrap = function (styleID, text, firstIndent, width) {
    if (this._styleMode <= LineMaker.STYLE_MONOCHROME)
        styleID = null;
    return this._wrap(styleID, text, firstIndent, width);
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
 * @param level Indentation level to apply to each line, multiplied by tabSize
 * @param text Text for a series of one or more lines, which must not contain "\r", but which may contain any number of "\n".
 */

LineMaker.prototype.multiline = function (level, text) {
    var lines = text.split("\n");
    if (lines[lines.length - 1].length === 0)
        lines.pop(); // assume "\n" terminates lines rather than delimits
    
    var self = this;
    var margin = this.margin(level);
    var s = "";
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
 * @param firstIndent Number of characters in indentation of first line relative to left margin. If non-zero, the background highlight on the last line of the wrap will end at the end of the text.
 * @param width Character-wrapping width and width of each resulting line
 */

LineMaker.prototype.styleWrap = function (styleID, text, firstIndent, width) {
    if (this._styleMode === LineMaker.STYLE_OFF)
        styleID = null;
    return this._wrap(styleID, text, firstIndent, width);
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

LineMaker.prototype._wrap = function (styleID, text, firstIndent, width) {
    var esc = (styleID !== null ? this._styleMap[styleID] : null);
    var width = width || 0;
    var lines = text.split("\n");
    var s = '';
    var remainder;
    var split;
    var self = this;

    lines.forEach(function(line) {
        while (line !== null) {
            if (s !== '')
                s += "\n";
            remainder = null;
            if (width > 0) {
                split = self._wrapLineAtMargin(line, width);
                line = split.nextLine;
                if (split.includesEsc)
                    line += self._styleMap.normal; // end line's escape
                if (esc && line.length < width) {
                    if (split.includesEsc)
                        line += esc; // restart wrapped escape
                    line += spaces(width - line.length);
                }
                remainder = split.remainder;
            }
            if (esc)
                s += esc + line + self._styleMap.normal;
            else
                s += line;
            line = remainder;
        }
    });
    return s;
};

LineMaker.prototype._wrapLineAtMargin = function (line, width) {
    var nextLine = '';
    var priorNextLineLength = 0;
    var printedLength = 0;
    var remainder = null;
    var matches = null;
    
    // keep appending width characters to nextLine until either nextLine is the
    // entire provided line or the printed width of nextLine is the given width.
    // appending width characters to nextLine may not result in width printed
    // characters because the line may contain (unprinted) escape sequences.
        
    while (printedLength < width && nextLine.length < line.length) {

        // initially assume there are no escape sequences

        var carryOverEsc = '';
        var priorPrintedLength = printedLength;
        nextLine += line.substr(nextLine.length, width);
        if (line.length > width)
            remainder = CONTINUED_CHAR + line.substr(width);
        
        // strip nextLine of all incomplete escape sequences
    
        matches = nextLine.match(REGEX_UNBROKEN_ESCAPES);
        nextLine = matches[0];
    
        // determine the length that nextLine would have were it printed.
        // escape sequences are not printed. also record the escape sequence
        // that would carry forward into the portion that follows nextLine.
    
        printedLength = nextLine.length;
        matches = nextLine.match(REGEX_ESCAPE_SEQ);
        if (matches !== null) {
        
            // reduce the printed length by the lengths of the escape seqs
            matches.forEach(function(esc) {
                printedLength -= esc.length;
            });
            
            // record the escape sequence that would carry into a remainder
            carryOverEsc = matches[matches.length - 1];
            
            // only carry forward what follows last style reset (if anything)
            var lastNormal = carryOverEsc.lastIndexOf(this._styleMap.normal);
            if (lastNormal >= 0) {
                carryOverEsc = carryOverEsc.substr(
                        lastNormal + this._styleMap.normal.length);
            }
        }
        
        // truncate nextLine <= width and create a remainder that carries
        // forward the last escape sequence of nextLine (if any), thus
        // propagating style from line to line even as lines wrap

        if (printedLength > width) {
            priorNextLineLength += width - priorPrintedLength;
            remainder = CONTINUED_CHAR + carryOverEsc +
                            line.substr(priorNextLineLength);
            nextLine = nextLine.substr(0, priorNextLineLength);
        }
    }
    return {
        nextLine: nextLine,
        remainder: remainder,
        includesEsc: (matches !== null)
    };
};

LineMaker.prototype._write = function (text) {
    if (this._writeFunc)
        this._writeFunc(text);
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
