/******************************************************************************
Methods for manipulating the stack traces of test results.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var fs = require('fs');
var _ = require('lodash');

//// CONSTANTS ////////////////////////////////////////////////////////////////

/**
 * Return information about the deepest call found in the provided stack trace.
 *
 * @param stack Stack trace string
 * @return an object containing the following properties, or null if failed to read the source file:
 *  - file: path to file of deepest call
 *  - line: line number of deepest call in file
 *  - column: number of column referenced by deepest call
 *  - source: source code line of deepest call, without trailing "\n"
 */
 
exports.getDeepestCallInfo = function (stack) {
    var matches = stack.match(/ \(([^): ]+)(:(\d+):(\d+))?/);
    if (!matches)
        matches = stack.match(/([^): ]+)(:(\d+):(\d+))?/);
        
    if (matches && matches[2]) {
        try {
            var fileText = fs.readFileSync(matches[1], 'utf8');
            var lines = fileText.split("\n");
            var lineNumber = parseInt(matches[3]);
            return {
                file: matches[1],
                line: lineNumber,
                column: parseInt(matches[4]),
                source: lines[lineNumber - 1]
            };
        }
        catch (err) {
            // fall through if can't get source line
        }
    }
    return null;
};

/**
 * Shorten a stack trace by truncating the series of calls at and above the provided atPath file path. This allows the caller to remove uninformative information from a trace. Also strip each trace line of atPath that starts the stack to remove uninformate calls to subtap monkey patches of tap. The method changes the 'stack' property within the stackHolder.
 *
 * @param stackHolder An object that may contain a 'stack' property that itself contains a string stack trace. The method does nothing if stackHolder has no 'stack' property.
 * @param atPath The file path to strip from the stack trace.
 */

exports.truncateTrace = function (stackHolder, atPath) {
    var droppedDeepestCall = false;
    var stack = stackHolder.stack;
    if (stack) {
        var findStr = atPath +":"; // helps ensure proper occurrence of atPath
        var pathIndex = stack.indexOf(findStr);
        while (pathIndex >= 0) {
            var priorNewLineIndex = stack.lastIndexOf("\n", pathIndex);
            if (priorNewLineIndex === -1) {
                var nextLineIndex = stack.indexOf("\n", pathIndex);
                if (nextLineIndex) {
                    stack = stack.substr(nextLineIndex + 1);
                    droppedDeepestCall = true;
                }
            }
            else
                stack = stack.substr(0, priorNewLineIndex + 1);
            var pathIndex = stack.indexOf(findStr);
        }
        stackHolder.stack = stack;
        if (stackHolder.at)
            delete stackHolder['at'];
    }
    
    if (droppedDeepestCall && !_.isUndefined(stackHolder.source)) {
        var callInfo = exports.getDeepestCallInfo(stack);
        stackHolder.source = _.trim(callInfo.source) +"\n" /*to format YAML*/;
    }
};

/**
 * Truncate stack traces found within tap-parser 'assert' event data. In particular, any 'stack' property found in assert.diag or assert.diag.found is truncated in accordance with function truncateTrace().
 *
 * @param assert The data that tap-parser provides with an 'assert' event.
 * @param atPath The file path to strip from the stack traces.
 */
 
exports.truncateAssertStacks = function (assert, atPath) {
    if (!assert.ok) {
        if (assert.diag) {
            exports.truncateTrace(assert.diag, atPath);
            if (assert.diag.found)
                exports.truncateTrace(assert.diag.found, atPath);
        }
    }
};
