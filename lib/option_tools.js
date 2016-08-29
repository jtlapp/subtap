/******************************************************************************
Functions for managing the option values that minimist returns.
******************************************************************************/

var _ = require('lodash');

/**
 * Turn boolean arguments off when suffixed by '-'. Minimist provides a "--no-<arg>" option for setting the value of <arg> to false. When an argument defaults to true (maybe because of an environment variable) and the user may need to frequently set it to false, the minimist way gets a bit cumbersome.
 *
 * @param options Options output of minimist, which the function modifies.
 * @param minimistConfig The configuration options provided to minimist to produces the given options. The function uses this to identify the boolean arguments and their aliases.
 */

exports.applyBooleanOffSwitch = function (options, minimistConfig) {
    if (_.isUndefined(minimistConfig.boolean))
        return;
    var aliases = minimistConfig.alias;
    minimistConfig.boolean.forEach(function (letter) {
        if (options[letter] === '-') {
            options[letter] = false;
            if (aliases && !_.isUndefined(aliases[letter]))
                options[aliases[letter]] = false;
        }
    });
};

/**
 * Generate a string that shows the help information for a group of options. The option templates are all left-aligned, the option descriptions are all left aligned to the right of the longest option template, and the option descriptions wrap at word boundaries at the given right margin.
 *
 * @param group An array of array pairs [optionTemplate, optionDescription]. The optionDescription can have multiple lines, including blank lines.
 * @param delim The delimiter to place between the option template and the start of its description. Use space characters to space the two apart.
 * @param leftMargin The margin at which to list the options templates.
 * @param righMargin The margin at which to wrap the option descriptions.
 * @param spaceEntries Whether to put a blank line between consecutive entries.
 * @return a string compilation of all of group's options, ending with "\n"
 */

exports.generateHelpGroup = function (
        group, delim, leftMargin, rightMargin, spaceEntries)
{
    var maxArgLength = 0;
    group.forEach(function (helpEntry) {
        if (helpEntry[0].length > maxArgLength)
            maxArgLength = helpEntry[0].length;
    });
    var leftTextMargin = leftMargin + maxArgLength + delim.length;
    var maxTextWidth = rightMargin - leftTextMargin;

    var leftMarginSpaces = ' '.repeat(leftMargin);
    var argumentPadding = ' '.repeat(maxArgLength);
    var textMarginSpaces = ' '.repeat(leftTextMargin);

    var help = '';
    group.forEach(function (helpEntry) {
        if (help !== '' && spaceEntries)
            help += "\n";
        var arg = helpEntry[0];
        var text = helpEntry[1];
        if (text[text.length - 1] === "\n")
            text = text.substr(0, text.length - 1);
        var lines = text.split("\n");
        var startLine = leftMarginSpaces + arg +
                argumentPadding.substr(arg.length) + delim;
        lines.forEach(function (line) {
            var wrappedLines = exports.wrapHelpLine(line, maxTextWidth);
            wrappedLines.forEach(function (wrappedLine) {
                help += startLine + wrappedLine;
                startLine = "\n"+ textMarginSpaces;
            });
        });
        help += "\n";
    });
    return help;
}

/**
 * Return the boolean value of a flag according to a flag list, where flags are case-sensitive letters.
 *
 * @param flags String of letters for flags that are true
 * @param flagLetter Letter of flat to look for in flags
 * @param defaultValue Value to return if flag is not found
 * @return true if the letter is found in the flag list; false otherwise
 */

exports.getFlag = function (flags, flagLetter, defaultValue) {
    if (_.isUndefined(flags))
        return defaultValue;
    return (flags.indexOf(flagLetter) >= 0);
};

/**
 * Minimist collects multiple assignments of the same option into an array of all of the assigned values. This feature is useful for allowing the command to support a default set of options, such as via an environment variable. Applying the default options before the actual options makes the last value of the array the intended value of the option. This function returns the last value of all array options except for those for which multiple values are allowed.
 *
 * @param options Options output of minimist, which the function modifies.
 * @param multiplesAllowed Array of options that collect all values instead of using only the last value supplied.
 */

exports.keepLastOfDuplicates = function (options, multiplesAllowed) {
    multiplesAllowed.push('_');
    Object.keys(options).forEach(function (key) {
        var option = options[key];
        if (_.isArray(option) && multiplesAllowed.indexOf(key) < 0)
            options[key] = option[option.length - 1];
    });
};

/**
 * Delete all but last of mutually exclusive options, returning the name of that option. Returns null if none of the mutually exclusive options were provided.
 *
 * @param options Options output of minimist, which the function modifies.
 * @param argv Array of arguments input to minimist.
 * @param alternatives Array of names of mutually exclusive options.
 * @return name of last mutually exclusive option, or null if none provided.
 */

exports.lastOfMutuallyExclusive = function (options, argv, alternatives) {
    var greatestIndex = -1;
    alternatives.forEach(function (option) {
        var lastIndex = argv.lastIndexOf(option);
        if (lastIndex > greatestIndex)
            greatestIndex = lastIndex;
    });
    if (greatestIndex < 0)
        return null;
        
    var lastOption = argv[greatestIndex];
    alternatives.forEach(function (option) {
        if (option !== lastOption)
            delete options[option]; // JS doesn't care if option not there
    });
    return lastOption;
};

/**
 * Wrap the provided line at the given maximum width and return an array of the wrapped lines.
 *
 * @param line Line to wrap, without trailing "\n"
 * @param maxWidth Column at which to wrap the line
 * @return an array of the lines that result from wrapping line at maxWidth
 */
 
exports.wrapHelpLine = function (line, maxWidth) {
    if (line.length === 0)
        return [''];
    var wrappedLines = [];
    
    // not terribly efficient, but does the job
    var words = line.split(' ');
    var run = '';
    var delim = '';
    words.forEach(function (word) {
        if (run.length + word.length <= maxWidth) {
            run += delim + word;
            delim = ' ';
        }
        else {
            wrappedLines.push(run);
            run = word;
        }
    });
    if (delim !== '')
        wrappedLines.push(run);
        
    return wrappedLines;
};