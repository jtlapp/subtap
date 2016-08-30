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
line("SUBTAP is a test runner for debugging test suites that primarily organize test assertions into named subtests. It is also a TAP pretty-printer that emphasizes making differences between found and wanted values obvious at a glance. This tool only works with tests that employ the 'tap' module (github 'node-tap').");
blankLine();

// Bugs might not be fun, but they can be pretty.

line("Usage:");
line("  subtap [options] [file-patterns]");
blankLine();

line("Both options and file-patterns are optional. file-patterns is a series of one or more glob patterns. When file-patterns is not given, the patterns \"test/*.js\" and \"tests/*.js\" are used. Subtap runs each file matching each pattern in a separate node process, reads the TAP output, and outputs a report spanning all the files.");
blankLine();
line("Subtap outputs test results in one of several formats, numbering the root subtests in each format. A \"root subtest\" is a test whose parent is the root test. The following options select the output format. 'tally' is the default, inspired by the 'faucet' command for the 'tape' test harness.");
blankLine();
var group = [];
group.push(['--fail', "Output only subtests and assertions that fail."]);
group.push(['--tally', "Output the results of all root subtests, whether they pass or fail, and all assertions that fail. (default)"]);
group.push(['--all', "Output the results of all tests and assertions."]);
group.push(['--tap', "Output the raw TAP text."]);
group.push(['--json', "Output 'tap-parser' module events in a JSON array."]);
options(group, true);
blankLine();

line("Subtap also provides the following options. The -bN and -rM options most distinguish subtap from other 'tap' test runners. They allow the user to quickly isolate and focus on problematic root subtests.");
blankLine();
group = [];
group.push(['-b --bail', "Bail out of testing on the first assertion to fail. (Same as the -b option in the 'tap' test runner.)"]);
group.push(['-bN --bail=N', "Bail out of testing after the Nth failing root subtest."]);
group.push(['-cN --color=N', "Render output in color mode N. Addding 10 canonicalizes output for saving to text files. (default -c2)\n\n"+
"  0: no color, emphasis, or other ANSI escape codes\n"+
"  1: monochrome, including emphasis\n"+
"  2: multicolor, including emphasis"
]);
group.push(['-d --diff', "Compare found and wanted values by interleaving diff lines. (Values otherwise display consecutively.)"]);
group.push(['-e --log-exceptions', "Catch and report subtest exceptions as failed assertions. Root test exceptions always terminate the run because they interrupt the numbering of root subtests."]);
group.push(['-f --full-functions', "When found/wanted values reference functions, show the function source code in addition to the signature."]);
group.push(['-h --help', "Show this help information."]);
group.push(['-r<m> --run=<m>', "Only run the tests that <m> lists. <m> is a subtest number (e.g. -r10) or a range of subtest numbers (e.g. -r10..14) or a comma-delimited list of subtest numbers and ranges (e.g. -r7,10..14,16). The list can't contain spaces."]);
group.push(['-tN --timeout=N', "Timeout after N milliseconds of inactivity. To disable the timeout, set N to 0. (default -t3000, or 3 seconds)"]);
group.push(['--mark=<f>[:<g>]', "Mark differences between found and wanted values according to flags. --mark=<f> sets flags <f> for all difference comparisons. --mark=<f>:<g> sets flags <f> for comparing consecutive values and flags <g> for comparing adjacent diff lines (see -d, --diff). (default --mark=BCR:BC)\n\n"+
"  B: bold (differing text shown in bold)\n"+
"  C: color (differing text shown in color)\n"+
"  R: reverse-video the first different character\n"+
"  _: turn off flags (e.g. --mark=BR:_)"]);
group.push(['--node-arg=<arg>', "Pass <arg> to the node process in which the test file runs. The argument is NOT placed in the test file's process.argv. [This is broken at the moment.]"]);
group.push(['--tab=N', "Indent each nested level by N spaces. (default --tab=2)"]);
group.push(['--wrap=M:N', "Wrap output at column N, but don't wrap found/wanted values at less than M chars wide. (default --wrap=20:80)"]);
options(group, true);
blankLine();

line("Subtap recognizes the following environment variables:");
blankLine();
group = [];
group.push(['SUBTAP_ARGS', "Space-delimited default command line arguments. These arguments apply except where overridden on the command line. The command line can turn off a boolean switch (e.g. -d or --diff) by suffixing a dash (e.g. -d-) or prefixing 'no-' (e.g. --no-diff)."]);
group.push(['SUBTAP_COLOR', "Path to a YAML file that specifies color overrides. The path may be relative to the current working directory. The file associates the following style names with ANSI escape code strings: (e.g. To make secondary labels orange, write 'label: \"\\e[38;5;166m\"')\n\n"+
"  pass - style for name of a passing assertion or subtest\n"+
"  root-fail - style for name of a failed root subtest\n"+
"  fail - style for other lines reporting errors or failures\n"+
"  found - style of background for a found value\n"+
"  wanted - style of background for a wanted value\n"+
"  same - style of background for a non-differing diff line\n"+
"  bad - style for marking found text that was not wanted\n"+
"  good - style for marking wanted text that was not found\n"+
"  label - style for a secondary YAML label"]);
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