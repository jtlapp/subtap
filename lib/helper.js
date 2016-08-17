
//// MODULES //////////////////////////////////////////////////////////////////

var _ = require('lodash');

//// CONSTANTS ////////////////////////////////////////////////////////////////

var REGEX_CANONICAL = new RegExp("(\r|\x1b\\[F|\x1b)", 'g');


exports.canonicalize = function(writeFunc, text) {
    text = text.replace(REGEX_CANONICAL, function (match) {
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
    writeFunc(text);
};

exports.truncateStack = (function () {
    var regexMap = {}; // static local
    return function (stackHolder, atPath) {
        var stack = stackHolder.stack;
        if (stack) {
            var regex = regexMap[atPath];
            if (!regex) {
                regex = new RegExp("\n( *(?:at )?).*"+
                            _.escapeRegExp(atPath) +":[0-9:]+")
                regexMap[atPath] = regex;
            }
                
            var matches = stack.match(regex);
            if (matches !== null) {
                stack = stack.substr(0, matches.index + 1 + matches[1].length);
                stack += "...("+ atPath +")...\n";
                stackHolder.stack = stack;
            }
            if (stackHolder.at)
                delete stackHolder['at'];
        }
    };
})();

exports.truncateAssertStacks = function (assert, atPath) {
    if (!assert.ok) {
        if (assert.diag)
            exports.truncateStack(assert.diag, atPath);
        if (assert.diag.found)
            exports.truncateStack(assert.diag.found, atPath);
    }
};
