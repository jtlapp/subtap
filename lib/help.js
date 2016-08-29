/******************************************************************************
Displays the command line help
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var optionTools = require("./option_tools");

//// CONSTANTS ////////////////////////////////////////////////////////////////

var OPTION_DELIM = '  '; // at least two spaces between option and its help
var LEFT_MARGIN = 2; // left margin of options help information
var RIGHT_MARGIN = 80; // wrap help text at this column

//// MAIN /////////////////////////////////////////////////////////////////////

blankLine();
line("SUBTAP is a test runner for debugging test suites that organize assertions into named subtests. It is also a TAP pretty-printer that emphasizes making differences between found and wanted values obvious at a glance. Subtap only works with tests that employ the 'tap' package (github 'node-tap').");
blankLine();

line("Usage:");
line("  subtap [options] [file-patterns]");
blankLine();

line("Both options and file-patterns are optional. file-patterns is a series of one or more glob patterns. When file-patterns is not given, the patterns \"test/*.js\" and \"tests/*.js\" are used. Subtap runs each file matching each pattern in a separate node process, monitors the TAP output, and renders a report to stdout.");
blankLine();
line("Subtap outputs test results in one of several formats. The following options select the format. 'tally' is the default, inspired by the 'faucet' command for 'tape'. A \"root subtest\" is a test whose parent is the root test.");
blankLine();
var group = [];
group.push(['--fail', "Output only subtests and assertions that fail."]);
group.push(['--tally', "Output the results of all root subtests, whether they pass or fail, and all assertions that fail. (default)"]);
group.push(['--all', "Output the results of all tests and assertions."]);
group.push(['--tap', "Output the raw TAP text."]);
group.push(['--json', "Output 'tap-parser' module events in a JSON array."]);
options(group, true);
blankLine();

line("Subtap also provides the folling options. The '-rN' and '-bN' options most distinguish subtap from other 'tap' test runners. They allow the user to quickly isolate and focus on problematic root subtests.");
blankLine();
group = [];
group.push(['-b --bail', "Bail out of testing on the first assertion to fail. (Same as '-b' option in the 'tap' runner.)"]);
group.push(['-bN --bail=N', "Bail out of testing after the Nth failing root subtest."]);
group.push(['-cN --color=N', "Render output in color mode N. (Adding 10 escapes escape codes and canonicalizes output for text files.)\n\n"+
"  0: no color, emphasis, or other ANSI escape codes\n"+
"  1: monochrome, including emphasis\n"+
"  2: multicolor, including emphasis"
]);
group.push(['-e --log-exceptions', "Catch and report subtest exceptions as failed assertions. Root test exceptions always terminate the run because they interrupt the numbering of root subtests."]);
group.push(['-f --full-functions', "Include source code of functions in found/wanted values."]);
group.push(['-h --help', "Show this help information."]);
group.push(['-rN --run=N', "Only run the Nth root subtest. Subtap displays root subtest numbers as the tests run for referencing."]);
group.push(['-tN --timeout=N', "Timeout for inactivity after N millisecs. To disable timeout, set N to 0. (default 3000)"]);
group.push(['--diffs[=<flags>]', "Indicate the differences between found and wanted values according to these flags. To suppress all indications, use '--diffs' without any flags. (default BCU)\n\n"+
"  B: bold (differing text shown in bold)\n"+
"  C: color (differing text shown in color)\n"+
"  I: interleave wanted and found lines in diffs format\n"+
"  U: underline first differing character"]);
group.push(['--node-arg=<arg>', "Pass <arg> to the node process in which the test file runs. The argument is NOT placed in the test file's process.argv."]);
group.push(['--tab=N', "Indent each level of nesting by N spaces. (default 2)"]);
group.push(['--width=M:N', "Wrap results at a minimum width of M characters; wrap all output at column N, unless extended by M. (default 20:80)"]);
options(group, true);
blankLine();

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function blankLine() {
    process.stdout.write("\n");
}

function line(text) {
    var wrappedLines = optionTools.wrapHelpLine(text, RIGHT_MARGIN);
    wrappedLines.forEach(function (wrappedLine) {
        process.stdout.write(wrappedLine +"\n");
    });
}

function options(group, spaceEntries) {
    var text = optionTools.generateHelpGroup(
            group, OPTION_DELIM, LEFT_MARGIN, RIGHT_MARGIN, spaceEntries);
    process.stdout.write(text);
}