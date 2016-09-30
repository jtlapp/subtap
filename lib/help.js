/******************************************************************************
Displays the command line help
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var optionhelp = require('option-help');

//// CONSTANTS ////////////////////////////////////////////////////////////////

var OPTION_DELIM = '  '; // at least two spaces between option and its help
var LEFT_MARGIN = 2; // left margin of options help information
var RIGHT_MARGIN = 80; // wrap help text at this column

//// MAIN /////////////////////////////////////////////////////////////////////

blankLine();
line("SUBTAP is a test runner for debugging test suites by selectively running subtests. It is optionally also a TAP pretty-printer that emphasizes making differences between found and wanted values obvious at a glance. This tool only works with tests that employ the 'tap' module (github 'node-tap').");
blankLine();

// Bugs might not be fun, but they can be pretty.

line("Usage:");
line("  subtap [options] [file-patterns]");
blankLine();

line("Both options and file-patterns are optional. file-patterns is one or more glob patterns. When file-patterns is not given, the patterns \"test/*.js\" and \"tests/*.js\" are used. Subtap runs each file matching each pattern in a separate node process, reads the TAP output, and outputs a report spanning all the files.");
blankLine();
line("Subtap outputs test results in one of several formats, numbering the root subtests in each format. A \"root subtest\" is a test whose parent is a file's root test. The following options select the output format. 'tally' is the default, inspired by the 'faucet' command for the 'tape' test harness.");
blankLine();
var group = [];
group.push(['--fail', "Output only subtests and assertions that fail."]);
group.push(['--tally', "Output the results of all root subtests, whether they pass or fail, and all assertions that fail. (default)"]);
group.push(['--all', "Output the results of all tests and assertions."]);
group.push(['--tap', "Output the raw TAP text. Useful for selectively running tests with subtap while rendering output using another TAP prettifier tool."]);
group.push(['--json', "Output 'tap-parser' module events in a JSON array."]);
options(group, true);
blankLine();

line("Subtap also provides the following options. The -bN, -r, --debug-brk, and --stdout options most distinguish subtap from other 'tap' test runners. They allow the user to quickly isolate and debug problematic root subtests, and they clearly separate the stderr/stdout of test files from test runner output.");
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
group.push(['--debug[=<p>]', "Receive debugger client on port <p> (default 5858), breaking only at breakpoints in test files. Sets -t0."]);
group.push(['--debug-brk[=<p>]', "Receive debugger client on port <p> (default 5858) with breakpoints at start of each root subtest. Sets -t0."]);
group.push(['--debug-port=<p>', "Set default debug port to <p> instead of 5858. Useful in SUBTAP_DEFAULT_ARGS to shorten --debug and --debug-brk."]);
group.push(['-e --log-exceptions', "Catch and report subtest exceptions as failed assertions. Root test exceptions always terminate the run because they interrupt the numbering of root subtests."]);
group.push(['-f --full-functions', "When found/wanted values reference functions, show the function source code in addition to the signature."]);
group.push(['-h --help', "Show this help information."]);
group.push(['--line-numbers[=N]', "Show line numbers for all found/wanted strings having N+ lines. --line-numbers sets N=2. 0 disables. (default 0)"]);
group.push(['--mark=<f>[:<g>]', "Mark differences between found & wanted values according to flags. --mark=<f> sets flags <f> for all difference comparisons. --mark=<f>:<g> sets flags <f> for comparing consecutive values and flags <g> for comparing adjacent diff lines (see -d, --diff). (default --mark=BCF:CR)\n\n"+
"  B: bold (differing text shown in bold)\n"+
"  C: color (differing text shown in color)\n"+
"  F: reverse-video the first different character\n"+
"  R: reverse-video the entire difference (restricted\n"+
"      to first line difference when using --diff)\n"+
"  _: turn off flags (e.g. --mark=BR:_)"]);
group.push(['--narg=<arg>', "Pass <arg> to the node executable that runs the test file. <arg> is NOT added to the file's process.argv. Use --narg repeatedly to pass multiple arguments. See --targ."]);
group.push(['-r<m> --run=<m>', "Only run the tests that <m> lists. <m> is a subtest number (e.g. -r10) or a range of subtest numbers (e.g. -r10..14) or a comma-delimited list of subtest numbers and ranges (e.g. -r7,10..14,16). Spaces are not allowed."]);
group.push(['--stderr=<w>', "Write each test file's stderr to <w>. See --stdout, replacing 'stdout' with 'stderr'. (default --stderr=each)"]);
group.push(['--stdout=<w>', "Write each test file's stdout to <w>, which is one of the following destinations: (default --stdout=end)\n\n"+
"  <file>: the file at path <file>, which must begin with\n"+
"           '/' or '.' (e.g. --stdout=./output.txt)\n"+
"  mix   : mixed in subtap's stdout; helps locate hanging\n"+
"           code (use with -c10 to prevent overwriting)\n"+
"  each  : in subtap's stdout after each test runs\n"+
"  end   : in subtap's stdout after all tests have run\n"+
"  none  : the bit bucket; discard the file's stdout\n"]);
group.push(['-tN --timeout=N', "Timeout after N milliseconds of inactivity. To disable the timeout, set N to 0. (default -t3000, or 3 seconds)"]);
group.push(['--tab=N', "Indent each nested level by N spaces. (default --tab=2)"]);
group.push(['--tap-limit=L', "Character length L to allot for the TAP output of a single test assertion, in KB. (default --tap-limit=32)"]);
group.push(['--targ=<arg>', "Pass <arg> to the test file(s) via process.argv. Use --targ repeatedly to pass multiple arguments. See --narg."]);
group.push(['--wrap=M:N', "Wrap output at column N, but don't wrap found/wanted values at less than M chars wide. (default --wrap=20:80)"]);
options(group, true);
blankLine();

line("Subtap recognizes the following environment variables:");
blankLine();
wrap("  SUBTAP_DEFAULT_ARGS\n"+
"    Space-delimited default command line arguments. These arguments apply except where overridden on the command line. The command line can turn off a boolean switch (e.g. -d or --diff) by suffixing a dash (e.g. -d-) or prefixing 'no-' (e.g. --no-diff).\n");
blankLine();
wrap("  SUBTAP_UNSTACK_PATHS\n"+
"    Colon-delimited list of paths to libraries (or frameworks) whose stack trace should be stripped from the output of failed test assertions. Each path is an integral series of path components. Stack trace truncates at the first line containing one of these series of path components.\n");
blankLine();
wrap("  SUBTAP_COLOR_FILE\n"+
"    Path to a YAML file specifying color overrides. The path may be relative to the current working directory. The file associates the following style names with ANSI escape code strings: (e.g. To make primary labels orange, write 'label1: \"\\e[38;5;166m\"')\n\n"+
"      pass - style for name of a passing assertion or subtest\n"+
"      root-fail - style for name of a failed root subtest\n"+
"      fail - style for other lines reporting errors or failures\n"+
"      found - style of background for a found value\n"+
"      wanted - style of background for a wanted value\n"+
"      same - style of background for a non-differing diff line\n"+
"      bad - style for marking found text that was not wanted\n"+
"      good - style for marking wanted text that was not found\n"+
"      label1 - style for a primary YAML label\n"+
"      label2 - style for a secondary YAML label\n");
blankLine();

//// SUPPORT FUNCTIONS ////////////////////////////////////////////////////////

function blankLine() {
    process.stdout.write("\n");
}

function line(text) {
    var wrappedLines = optionhelp.wrapLine(text, RIGHT_MARGIN);
    wrappedLines.forEach(function (wrappedLine) {
        process.stdout.write(wrappedLine +"\n");
    });
}

function options(group, spaceEntries) {
    var text = optionhelp.generateHelpGroup(
            group, OPTION_DELIM, LEFT_MARGIN, RIGHT_MARGIN, spaceEntries);
    process.stdout.write(text);
}

function wrap(text) {
    process.stdout.write(optionhelp.wrapText(text, RIGHT_MARGIN, true));
}