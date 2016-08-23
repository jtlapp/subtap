/******************************************************************************
Methods for manipulating the stack traces of test results.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var _ = require('lodash');

//// CONSTANTS ////////////////////////////////////////////////////////////////

/**
 * Shorten a stack trace by truncating the series of calls at and above the provided atPath file path. This allows the caller to remove uninformative information from a trace. Also strip each trace line of atPath that starts the stack to remove uninformate calls to subtap monkey patches of tap. The method changes the 'stack' property within the stackHolder.
 *
 * @param stackHolder An object that may contain a 'stack' property that itself contains a string stack trace. The method does nothing if stackHolder has no 'stack' property.
 * @param atPath The file path to strip from the stack trace.
 */

exports.truncateStack = function (stackHolder, atPath) {
    var stack = stackHolder.stack;
    if (stack) {
        var findStr = atPath +":"; // helps ensure proper occurrence of atPath
        var pathIndex = stack.indexOf(findStr);
        while (pathIndex >= 0) {
            var priorNewLineIndex = stack.lastIndexOf("\n", pathIndex);
            if (priorNewLineIndex === -1) {
                var nextLineIndex = stack.indexOf("\n", pathIndex);
                if (nextLineIndex)
                    stack = stack.substr(nextLineIndex + 1);
            }
            else
                stack = stack.substr(0, priorNewLineIndex + 1);
            var pathIndex = stack.indexOf(findStr);
        }
        stackHolder.stack = stack;
        if (stackHolder.at)
            delete stackHolder['at'];
    }
};

/**
 * Truncate stack traces found within tap-parser 'assert' event data. In particular, any 'stack' property found in assert.diag or assert.diag.found is truncated in accordance with function truncateStack().
 *
 * @param assert The data that tap-parser provides with an 'assert' event.
 * @param atPath The file path to strip from the stack traces.
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
