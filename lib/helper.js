/******************************************************************************
Miscellaneous methods for assisting subtap components.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var _ = require('lodash');

//// CONSTANTS ////////////////////////////////////////////////////////////////

/**
 * Shorten a stack trace by truncating the series of calls at and above the provided atPath file path. This allows the caller to remove uninformative information from a trace. The method changes the 'stack' property within the stackHolder.
 *
 * @param stackHolder An object that may contain a 'stack' property that itself contains a string stack trace. The method does nothing if stackHolder has no 'stack' property.
 * @param atPath The file path at which to truncate the stack trace.
 */

exports.truncateStack = (function () {
    var regexMap = {}; // static local
    return function (stackHolder, atPath) {
        var stack = stackHolder.stack;
        if (stack) {
            var regex = regexMap[atPath];
            if (!regex) {
                regex = new RegExp("\n *(?:at )?.*"+
                            _.escapeRegExp(atPath) +":[0-9:]+")
                regexMap[atPath] = regex;
            }
                
            var matches = stack.match(regex);
            if (matches !== null)
                stackHolder.stack = stack.substr(0, matches.index + 1);
            if (stackHolder.at)
                delete stackHolder['at'];
        }
    };
})();

/**
 * Truncate stack traces found within tap-parser 'assert' event data. In particular, any 'stack' property found in assert.diag or assert.diag.found is truncated in accordance with function truncateStack().
 *
 * @param assert The data that tap-parser provides with an 'assert' event.
 * @param atPath The file path at which to truncate stack traces.
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
