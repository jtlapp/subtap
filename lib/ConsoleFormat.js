/******************************************************************************
ConsoleFormat formats lines for console output in conformance with its configuration. This class does not actually output to the console, though.

For maximum compatibility across consoles, every method that produces styling ends in an escape code for turning all styling off.

options:
 - tabSize: width of each indentation level in spaces
 - clearToEnd: whether to clear to the end of each line after printing
 - monochrome: whether to suppress colors. does not suppress bold.
 - styled: whether to suppress all console escape codes
******************************************************************************/

function ConsoleFormat(options) {
    this._tabSize = options.tabSize || 2;
    this._clearToEnd = options.clearToEnd || false;
    this._monochrome = options.monochrome || false;
    this._styled = options.styled || true;
}
module.exports = ConsoleFormat;

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

ConsoleFormat.prototype.bold = function (text) {
    return this._textStyle(text, '\x1b[1m');
};

ConsoleFormat.prototype.cyanBkg = function (text, width) {
    return this._color(this._bkgStyle, text, '\x1b[106m', width);
};

ConsoleFormat.prototype.green = function (text) {
    return this._color(this._textStyle, text, '\x1b[32m');
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

ConsoleFormat.prototype.red = function (text) {
    return this._color(this._textStyle, text, '\x1b[31m');
};

ConsoleFormat.prototype.redBkg = function (text, width) {
    return this._color(this._bkgStyle, text, '\x1b[101m', width);
};

ConsoleFormat.prototype.yellowBkg = function (text, width) {
    return this._color(this._bkgStyle, text, '\x1b[103m', width);
};

ConsoleFormat.prototype.white = function (text) {
    return this._color(this._textStyle, text, '\x1b[97m');
};

//// PRIVATE METHODS //////////////////////////////////////////////////////////

ConsoleFormat.prototype._bkgStyle = function (text, esc, width) {
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

ConsoleFormat.prototype._color = function (method, text) {
    var methodArgs = Array.prototype.slice.call(arguments, 1);
    return (this._monochrome ? text : method.apply(this, methodArgs));
};

ConsoleFormat.prototype._textStyle = function (text, esc) {
    return (this._styled ? esc + text +'\x1b[0m' : text);
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
