/******************************************************************************
ConsoleFormat formats lines for console output in conformance with its configuration. This class does not actually output to the console, though.

For maximum compatibility across consoles, every method that produces styling ends in an escape code for turning all styling off.

options:
 - tabSize: width of each indentation level in spaces
 - clearToEnd: whether to clear to the end of each line after printing
 - monochrome: whether to suppress colors. does not suppress bold.
 - styled: whether to suppress all console escape codes
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var colorSupport = require('color-support');

//// CONSTRUCTION /////////////////////////////////////////////////////////////

function ConsoleFormat(options) {
    this._tabSize = options.tabSize || 2;
    this._clearToEnd = options.clearToEnd || false;
    this._styled = options.styled || true;
    
    this._colorMap = null;
    if (!options.monochrome) {
        if (colorSupport.has256 && options.colorMap256)
            this._colorMap = options.colorMap256;
        else if (colorSupport.hasBasic && options.colorMap16)
            this._colorMap = options.colorMap16;
    }
}
module.exports = ConsoleFormat;

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

ConsoleFormat.prototype.bold = function (text) {
    return this.style('\x1b[1m', text);
};

ConsoleFormat.prototype.color = function (colorID, text) {
    if (!this._colorMap)
        return text;
    return this.style(this._colorMap[colorID], text);
};

ConsoleFormat.prototype.colorWrap = function (colorID, text, width) {
    if (!this._colorMap)
        return text;
    return this.wrap(this._colorMap[colorID], text, width);
};

ConsoleFormat.prototype.line = function (level, text) {
    return this.margin(level) + text + this.lineEnd();
};

ConsoleFormat.prototype.lineEnd = function () {
    return (this._clearToEnd ? '' : ConsoleFormat.CLEAR_END);
};

ConsoleFormat.prototype.margin = function (level) {
    return ConsoleFormat.spaces(level * this._tabSize);
};

ConsoleFormat.prototype.multiline = function (level, text) {
    var firstNewline = text.indexOf("\n");
    if (firstNewline === -1 || firstNewline === text.length - 1)
        return this.line(level, text) + "\n";
        
    var lines = text.split("\n");
    if (lines[lines.length - 1] === "")
        lines.pop();
    
    var self = this;
    var margin = this.margin(level);
    var s = "";
    lines.forEach(function (line) {
        s += margin + line + self.lineEnd() +"\n";
    });
    return s;
};

ConsoleFormat.prototype.style = function (esc, text) {
    return (this._styled ? esc + text +'\x1b[0m' : text);
};

ConsoleFormat.prototype.wrap = function (esc, text, width) {
    if (!this._styled)
        return text;
    var width = width || 0;
    var lines = text.split("\n");
    var s = '';
    var remainder;
    var self = this;

    lines.forEach(function(line) {
        while (line !== null) {
            if (s !== '')
                s += "\n";
            remainder = null;
            if (width > 0) {
                if (line.length > width) {
                    remainder = "…"+ line.substr(width);
                    line = line.substr(0, width);
                }
                if (line.length < width)
                    line += ConsoleFormat.spaces(width - line.length);
            }
            s += esc + line +"\x1b[0m";
            line = remainder;
        }
    });
    return s;
};

//// STATIC PROPERTIES ////////////////////////////////////////////////////////

ConsoleFormat.CLEAR_END = '\x1b[K'; // clear to end of line
ConsoleFormat.UP_LINE = '\x1b[F'; // go up one line

ConsoleFormat.spaces = (function () {
    var SPACES = "    "; // static local
    return function (count) {
        if (count === 0)
            return ''; // a little faster
        if (count > 512) {
            // seems ridiculous, but it's already caught a mistake
            throw new Error("Excessive space request ( "+ count +
                    " spaces) may indicate error");
        }
        while (SPACES.length < count)
            SPACES += SPACES;
        return SPACES.slice(0, count);
    };
})();
