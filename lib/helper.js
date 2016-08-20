/******************************************************************************
Miscellaneous methods for assisting subtap components.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var _ = require('lodash');

//// CONSTANTS ////////////////////////////////////////////////////////////////

/**
 * Shorten a stack trace by abbreviating the series of calls at and above a certain file into a single "...(file)..." mention of the file. This allows the caller to remove uninformative information from a trace. The method changes the 'stack' property within the stackHolder.
 *
 * @param stackHolder An object that may contain a 'stack' property that itself contains a string stack trace. The method does nothing if stackHolder has no 'stack' property.
 * @param atPath The file path to look for in the stack trace to use in the adjusted trace as a replacement for all calls found above this path.
 */

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

/**
 * Truncate stack traces found within tap-parser 'assert' event data. In particular, any 'stack' property found in assert.diag or assert.diag.found is truncated in accordance with function truncateStack().
 *
 * @param assert The data that tap-parser provides with an 'assert' event.
 * @param atPath The file path to look for in each stack trace to use in the adjusted trace as a replacement for all calls found above this path.
 */
 
exports.truncateAssertStacks = function (assert, atPath) {
    if (!assert.ok) {
        if (assert.diag) {
            exports.truncateStack(assert.diag, atPath);
            if (assert.diag.found)
                exports.truncateStack(assert.diag.found, atPath);
        }
    }
};
