/******************************************************************************
ConsoleFormat formats lines for console output in conformance with its configuration. This class does not actually output to the console, though.

For maximum compatibility across consoles, every method that produces styling ends in an escape code for turning all styling off.
******************************************************************************/

function ConsoleFormat(options) {
    this._tabSize = options.tabSize || 2;
    this._clearToEnd = options.clearToEnd || false;
    this._monochrome = options.monochrome || false;
    this._styled = options.styled || true;
}
module.exports = ConsoleFormat;

//// INSTANCE METHODS /////////////////////////////////////////////////////////

ConsoleFormat.prototype.bold = function (text) {
    if (!this._styled)
        return text;
    return '\x1b[1m'+ text + '\x1b[0m';
};

ConsoleFormat.prototype.green = function (text) {
    if (!this._styled || this._monochrome)
        return text;
    return '\x1b[32m'+ text +'\x1b[0m';
};

ConsoleFormat.prototype.line = function (level, text) {
    return this.margin(level) + text + this.lineEnd();
};

ConsoleFormat.prototype.lineEnd = function () {
    if (this._clearToEnd)
        return '';
    return ConsoleFormat.CLEAR_END;
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
    if (!this._styled || this._monochrome)
        return text;
    return '\x1b[31m'+ text +'\x1b[0m';
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
            throw new Error("Excessive space request ( "+ count +
                    " spaces) may indicate error");
        }
        while (SPACES.length < count)
            SPACES += SPACES;
        return SPACES.slice(0, count);
    };
})();
