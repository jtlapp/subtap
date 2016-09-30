/******************************************************************************
Methods for manipulating the stack traces of test results.
******************************************************************************/

var fs = require('fs');
var _ = require('lodash');

/**
 * Return source information for the deepest call found in a stack trace.
 *
 * @param stack Stack trace string
 * @return an object containing the following properties, or null if failed to read the source file:
 *  - file: path to file of deepest call
 *  - line: line number of deepest call in file
 *  - column: number of column referenced by deepest call
 *  - source: source code line of deepest call, without trailing "\n"
 */
 
exports.getCallSourceInfo = function (stack) {
    var matches = stack.match(/at .*?(\/.+?):(\d+):(\d+)/);
    if (matches === null)
        matches = stack.match(/[^(]*\(([^:]+):(\d+):(\d+)\)/);
    if (matches === null)
        matches = stack.match(/([^:]+):(\d+):(\d+)/);

    if (matches) {
        try {
            var fileText = fs.readFileSync(matches[1], 'utf8');
            var lines = fileText.split("\n");
            var lineNumber = parseInt(matches[2]);
            return {
                file: matches[1],
                line: lineNumber,
                column: parseInt(matches[3]),
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
 * Drops test runner trace from a stack trace. It shortens the stack by truncating the series of calls at and above the provided atPath file path. Also strip each trace line of atPath that starts the stack to remove calls to monkey patches. The method changes the 'stack' property within the stackHolder.
 *
 * @param stackHolder An object that may contain a 'stack' property that itself contains a string stack trace. The method does nothing if stackHolder has no 'stack' property.
 * @param atPath The file path to strip from the stack trace.
 */

exports.dropRunnerTrace = function (stackHolder, atPath) {
    if (atPath === null)
        return;
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
        var callInfo = exports.getCallSourceInfo(stack);
        if (callInfo !== null)
            stackHolder.source = _.trim(callInfo.source) +"\n";
    }
};

/**
 * Truncates stack trace starting at a path that contains subpath, unless the path is the first line of the trace. A line matches subpath if subpath matches an integral number of components of the path found in the line. Use to remove uninformative library or framework trace lines.
 *
 * @param stackHolder An object that may contain a 'stack' property that itself contains a string stack trace. The method does nothing if stackHolder has no 'stack' property.
 * @param subpath A subpath of the first path at which to truncate the stack trace, containing an integral number of path components.
 */
 
exports.truncateTrace = function (stackHolder, subpath) {
    var stack = stackHolder.stack;
    if (stack) {
        var match = stack.match(new RegExp(
                "(^|[ (/])"+ _.escapeRegExp(subpath) +"([ )/:]|$)", 'm'));
        if (match !== null) {
            var priorNewLineIndex = stack.lastIndexOf("\n", match.index);
            if (priorNewLineIndex > 0) {
                stackHolder.stack =
                        _.trim(stack.substr(0, priorNewLineIndex + 1)) +"\n";
            }
        }
    }
};

/**
 * Truncate stack traces found within tap-parser 'assert' event data. In particular, any 'stack' property found in assert.diag or assert.diag.found is truncated in accordance with function dropRunnerTrace().
 *
 * @param assert The data that tap-parser provides with an 'assert' event.
 * @param runfilePath Path for the test runner file, to be stripped from the stack.
 * @param unstackPaths Additional paths to strip from the stack. The path must match an integral number of components of a stack path to apply.
 */
 
exports.truncateAssertStacks = function (assert, runfilePath, unstackPaths) {
    if (!assert.ok) {
        if (assert.diag) {
            exports.dropRunnerTrace(assert.diag, runfilePath);
            unstackPaths.forEach(function (unstackPath) {
                exports.truncateTrace(assert.diag, unstackPath);
            });
            if (assert.diag.found) {
                exports.dropRunnerTrace(assert.diag.found, runfilePath);
                unstackPaths.forEach(function (unstackPath) {
                    exports.truncateTrace(assert.diag.found, unstackPath);
                });
            }
        }
    }
};
