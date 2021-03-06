# subtap

a test runner for [`tap`](https://github.com/tapjs/node-tap) that selectively runs subtests

## BETA RELEASE

This is a beta release of `subtap` for the purpose of getting initial feedback. Once I have some confidence that the generated output is reasonable and relatively stable, I'll produce a test suite for it and release version 1.0.0.

## Overview

`subtap` is a test runner for [`tap`](https://github.com/tapjs/node-tap) that is designed specifically for debugging tests and for allowing you to selectively run subtests. It is optionally also a TAP pretty-printer that emphasizes making even subtle differences between found and wanted values obvious at a glance.

`subtap` organizes debugging around root subtests. A "root subtest" is a test whose parent is a file's root `tap` test. `subtap` numbers the root subtests across all of the test files. You can rerun root subtests by indicating their numbers, have the debugger break at the start of each root subtest, and bail out of the test runner after a given number of root subtest failures.

You control `subtap`'s output format. You can have it filter subtests for TAP output or you can pretty-print YAML-like output, optionally showing test results in JSON. The pretty-printing strives to clearly show differences between the found and wanted values of test assertions, including aligning values for vertical comparison and highlighting differences in non-printable characters. You can also show differences as interleaving diff lines. ([example output](#example-output))

This tool only works with tests that employ the [`tap`](https://github.com/tapjs/node-tap) module.

## Why another test runner?

This test runner is for debugging. It employs [`tap`](https://github.com/tapjs/node-tap), so you can also run your tests with `tap`, which is good for regression and coverage testing. `subtap` strives to be good for debugging. With `subtap` you can:

- Select subtests to rerun by number, even across files, running no others.
- Have a debugger automatically break at the start of each root subtest.
- Bail out after a specified number of root subtests fail.
- Optionally exit when your code throws an unexpected exception, instead of having it logged as a test failure and plowing on with testing.
- Timeout after a period of test inactivity instead of at maximum test duration, allowing for tests of drammatically varying length.
- Pause the test runner mid-test at a prompt to allow unlimited inspection of resources and processes.
- Collect test file `stdout` for output after runner output or for writing to a file, delimiting it by test filename.
- Clearly highlight non-printing character differences in test results.
- Assign colors and result difference emphasis that make debugging fun.

## Advantages of Root Subtests

`subtap` makes root subtests the units of test instead of whole files. It runs assertions found on the root test, of course, but the following advantages become available by organizing assertions into subtests and using `subtap`:

- Because `subtap` assigns a test number to each root subtest, you need only remember a subtest number to rerun it, instead of having to remember and type (or copy-and-paste) a filename.
- You can decide which root subtests to rerun soley on the basis of their descriptive names; you don't have to decide whether it's reasonable to rerun all of the subtests in its file based on the more cryptic filename.
- Being able to isolate one root subtest at a time reduces the need to copy-and-paste entire tests into new files to debug them. A debugger can even automatically break at the start of each root subtest.
- If multiple people are working on a problem, instead of having to communicate a filename or a test name, you need only communicate a test number. This assumes that both parties have identical copies of the test suite, because otherwise the test numbers might differ.
- Instead of trying to only group subtests together in a file that you're willing to always run together, you have more freedom to organize subtests into files according to logical association, facilitating maintenance.

*CAVEAT*: When using `subtap` to glob across multiple test files, test numbers depend on the order in which files load. This order should be consistent from run-to-run until tests are added or deleted or files are renamed. Order may vary from machine to machine, depending on their file systems and on the order in which the files occur in the file system.

## Installation

To install the `subtap` command globally:

```
sudo npm install -g subtap
```

You may also install `subtap` localling and access the executable at `./bin/subtap`:

```
npm install subtap --save-dev
```

## Usage

```
subtap [options] [file-patterns]
```

Both `options` and `file-patterns` are optional. `file-patterns` is one or more glob patterns. When `file-patterns` is not given, the patterns `test/*.js` and `tests/*.js` are used. `subtap` runs each file matching each pattern in a separate node process, reads the TAP output, and outputs a report spanning all the files.

## Output Formats

`subtap` outputs test results in one of several formats. Each format supports selectively running root subtests by test number. The following options select the output format. 'tally' is the default, inspired by the [`faucet`](https://github.com/substack/faucet) command for the [`tape`](https://github.com/substack/tape) test harness.

```
  --fail   Output only subtests and assertions that fail.

  --tally  Output the results of all root subtests, whether they pass or fail,
           and all assertions that fail. (default)

  --all    Output the results of all tests and assertions.

  --tap    Output the raw TAP text. Useful for selectively running tests with
           subtap while rendering output using another TAP prettifier tool.

  --json   Output 'tap-parser' module events in a JSON array.
```

## Additional Options

`subtap` also provides the following options. The `-bN`, `-r`, `--debug-brk`, and `--stdout` options most distinguish subtap from other 'tap' test runners. They allow the user to quickly isolate and debug problematic root subtests, and they clearly separate the stderr/stdout of test files from test runner output.

```
  -b --bail            Bail out of testing on the first assertion to fail. (Same
                       as the -b option in the 'tap' test runner.)

  -bN --bail=N         Bail out of testing after the Nth failing root subtest.

  -cN --color=N        Render output in color mode N. Addding 10 canonicalizes
                       output for saving to text files. (default -c2)
                       
                         0: no color, emphasis, or other ANSI escape codes
                         1: monochrome, including emphasis
                         2: multicolor, including emphasis

  --catch              Catch and report subtest exceptions as failed assertions.
                       Root test exceptions always terminate the run because
                       they interrupt the numbering of root subtests.

  -d --diff            Compare found and wanted values by interleaving diff
                       lines. (Values otherwise display consecutively.)

  --debug[=<p>]        Receive debugger client on port <p> (default 5858),
                       breaking only at breakpoints in test files. Sets -t0.

  --debug-brk[=<p>]    Receive debugger client on port <p> (default 5858) with
                       breakpoints at start of each root subtest. Sets -t0.

  --debug-port=<p>     Set default debug port to <p> instead of 5858. Useful in
                       SUBTAP_DEFAULT_ARGS to shorten --debug and --debug-brk.

  -f --full-functions  When found/wanted values reference functions, show the
                       function source code in addition to the signature.

  -h --help            Show this help information.

  --line-numbers[=N]   Show line numbers for all found/wanted strings having N+
                       lines. --line-numbers sets N=2. 0 disables. (default 0)

  --mark=<f>[:<g>]     Mark differences between found & wanted values according
                       to flags. --mark=<f> sets flags <f> for all difference
                       comparisons. --mark=<f>:<g> sets flags <f> for comparing
                       consecutive values and flags <g> for comparing adjacent
                       diff lines (see -d, --diff). (default --mark=BCF:CR)
                       
                         B: bold (differing text shown in bold)
                         C: color (differing text shown in color)
                         F: reverse-video the first different character
                         R: reverse-video the entire difference (restricted
                             to first line difference when using --diff)
                         _: turn off flags (e.g. --mark=BR:_)

  --narg=<arg>         Pass <arg> to the node executable that runs the test
                       file. <arg> is NOT added to the file's process.argv. Use
                       --narg repeatedly to pass multiple arguments. See --targ.

  -r<m> --run=<m>      Only run the tests that <m> lists. <m> is a subtest
                       number (e.g. -r10) or a range of subtest numbers (e.g.
                       -r10..14) or a comma-delimited list of subtest numbers
                       and ranges (e.g. -r7,10..14,16). Spaces are not allowed.

  --stderr=<w>         Write each test file's stderr to <w>. See --stdout,
                       replacing 'stdout' with 'stderr'. (default --stderr=each)

  --stdout=<w>         Write each test file's stdout to <w>, which is one of the
                       following destinations: (default --stdout=end)
                       
                         <file>: the file at path <file>, which must begin with
                                  '/' or '.' (e.g. --stdout=./output.txt)
                         mix   : mixed in subtap's stdout; helps locate hanging
                                  code (use with -c10 to prevent overwriting)
                         each  : in subtap's stdout after each test runs
                         end   : in subtap's stdout after all tests have run
                         none  : the bit bucket; discard the file's stdout

  -tN --timeout=N      Timeout after N milliseconds of inactivity. To disable
                       the timeout, set N to 0. (default -t3000, or 3 seconds)

  --tab=N              Indent each nested level by N spaces. (default --tab=2)

  --tap-limit=L        Character length L to allot for the TAP output of a
                       single test assertion, in KB. (default --tap-limit=32)

  --targ=<arg>         Pass <arg> to the test file(s) via process.argv. Use
                       --targ repeatedly to pass multiple arguments. See --narg.

  --wrap=M:N           Wrap output at column N, but don't wrap found/wanted
                       values at less than M chars wide. (default --wrap=20:80)
```

## Running a Debugger

You can connect a debugger to `subtap` to step through tests as they run. Use `--debug-brk` to break at the start of each root subtest. Use `--debug` to break only at your breakpoints, such as those of `debugger` statements. By combining `--debug-brk` with `-r<m>` you can walk the debugger through only root subtests of your choosing.

The debugger runs as a separate process from `subtap`. By default, node serves the debugger on port 5858. You can select a different port `<p>` using the options `--debug=<p>` or `--debug-brk=<p>`. If you consistently use a different port, you can make your preferred port the default by adding `--debug-port=<p>` to the `SUBTAP_DEFAULT_ARGS` environment variable. For example, placing `--debug-port=5859` in `SUBTAP_DEFAULT_ARGS` would cause `--debug` on the command line to use port 5859, without having to fully specify `--debug=5859`.

As you proceed with debugging using any output format but `--fail`, the terminal running `subtap` shows the current test filename and subtest name, as well as the descriptions and results of previously completed assertions.

### Using the built-in debug client

Here are the steps for using `subtap` with node's built-in debug client:

1. First run `subtap` using either `--debug` or `--debug-brk`. By default, these options listen for the debugger on port 5858. You will only see the line telling you this when using `--stderr=mix`, as otherwise the line gets stored for output later. If you ran with `--debug-brk` and any format but `--fail`, the terminal shows you the name of the subtest that is about to run.
2. From a second terminal window, connect to `subtap` with the command `node debug localhost:5858`. You'll get only the response `connecting to localhost:5858 ... ok`. Apparently due to a bug ([see my report](https://github.com/nodejs/node/issues/8565)), the source code context does not show immediately for our use case.
3. Type 'n' or 's' to advance to the next line of code. The debugger now properly shows the source code context.
4. If you ran with `--debug-brk`, the debugger will now be on the line `rootSubtest(t)`. Step into this line with 's' to enter the source code for this subtest.
5. Step through the debugger to debug your test. When you are ready to move on to the next test, type 'c' to continue the debugger. If you ran with `--debug-brk`, the debugger will automatically break at the next root subtest. If you ran with `--debug`, you'll stop wherever your next breakpoint is.
6. Proceed from subtest to subtest debugging as you please. When a test file completes and `subtap` moves on to another test file, the debugger disconnects and reports `program terminated`. Enter `run` into the debugger to resume testing, though you may need to enter *ctrl-C* to get the debugger into the right context for this. Loop back to step 3 to continue debugging.

### Using node-inspector (aka `node-debug`)

It is quite a bit easier to debug with [node-inspector](https://github.com/node-inspector/node-inspector). The steps are analogous to those for using node's built-in client:

1. First run `subtap` using either `--debug` or `--debug-brk`, but use a port other than 5858, such as `--debug=5859`. The line that tells you the debugger is running only shows when using `--stderr=mix`, as otherwise the line gets stored for output later. If you ran with `--debug-brk` and any format but `--fail`, the terminal shows you the name of the subtest that is about to run.
2. From a second terminal window, run node-inspector with the command `node-debug`. Ignore its messages about running a debugger on a port. Then point Chrome or Opera to `http://localhost:8080?port=5859`. Apparently due to a bug ([see my report](https://github.com/nodejs/node/issues/8565)), the debugger may or may not show the correct source code at this point, but don't worry.
3. Step over (F10) or into (F11) to advance to the next line of code. The debugger now properly shows the source code context.
4. If you ran with `--debug-brk`, the debugger will now be on the line `rootSubtest(t)`. Step into this line (F11) to enter the source code for this subtest.
5. Step through the debugger to debug your test. When you are ready to move on to the next test, resume (F8) the debugger. If you ran with `--debug-brk`, the debugger will automatically break at the next root subtest. If you ran with `--debug`, you'll stop wherever your next breakpoint is.
6. Proceed from subtest to subtest debugging as you please. When a test file completes and `subtap` moves on to another test file, the debugger gets interrupted and automatically reloads. After reloading, you should see source again. If not, the page reloaded before `subtap` could launch the next test, so manually refresh the page. Due to the bug in node, the debugger may show the wrong source line. Loop back to step 3 to continue debugging.

## Pausing at a Prompt

A test may pause waiting for input from the `subtap` test runner. `subtap` presents a message and waits for the user to either hit *Enter* or type something and hit *Enter*. `subtap` passes the typed value back to the test, which may then resume. This feature is particularly useful for temporarily pausing tests to allow the user to inspect the mid-test states of the various resources and processes involved. In this case, the test ignores the value.

Tests may run under test runners that don't support prompt input, so the test must determine whether prompt input is available before pausing. A test runner such as `subtap` indicates support by setting the `SUPPORTS_PROMPT_INPUT_IPC` environment variable to any value but the string `'false'`.

If prompt input is supported, the test asks `subtap` to prompt the user by sending an IPC with properties `event` and `message`, where `event` is set to `'prompt'` and `message` is the string to display at the prompt. The test then listens for a response via the process event `promptInput`. Install the event listener first in case the test runner provides an immediate response, such as from buffered input. Sample code:

```js
process.on('promptInput', function (input) {
    // proceed with test using input
});
process.send({
    event: 'prompt',
    message: '<message-to-display-at-prompt>'
});
```

Normally you would do this within a promise and call `resolve(input)` on receiving the `promptInput` event.

`subtap` suspends the inactivity timeout for the duration of the prompt.

*Note:* I'm preparing a library of tools for using [webdriver.io](http://webdriver.io/) with `subtap`, including a `prompt` command.

## Differencing with Line Numbers

When test assertions compare long text strings of many lines, it can help to include line numbers in the presentation of differences between the strings. When lines are identical but at different line numbers in the two strings, the differing line numbers should not show as differences in the lines. `subtap` provides two methods for displaying line numbers when differencing strings -- the `--line-numbers` option, and the `lineNumberDelim` TAP `extra` value.

### Automatically Numbering Lines

The `--line-numbers` options tells `subtap` when to add line numbers to found and wanted values that are strings. Use `--line-numbers=N` to have `subtap` automatically number strings that have at least `N` lines. An LF (`\n`) is assumed to end every line but a non-empty last line. The empty string has no lines, `apple\npear\n` has two lines, and `apple\npear\ngrape` has three lines. Using `--line-numbers` without specifying a number sets `N` to 2. Setting `N` to 0 disables automatic line numbering. Line numbering is disabled by default.

Let's look at an example. The found and wanted values here are different:

```js
var t = require('tap');

t.test("automatic line numbering", function (t) {

    var wanted =
        "The line numbers in this wanted text don't get differenced.\n"+
        "A unique second line groups with the prior line.\n"+
        "Both found and wanted text share this third line.\n"+
        "This long line is missing from the found text. It wraps across"+
            " lines and has no similar counterpart line.\n"+
        "The line is also shared, but at different line numbers. The line"+
            " number shown with -d is its line number in found text.\n"+
        "The last line is like its counterpart, but at a different line"+
            " number. The different line number is not highlighted as a"+
            " difference."; 
    var found =
        "The line numbers in this found text also don't get differenced.\n"+
        "Another unique second line grouping with the prior line.\n"+
        "Both found and wanted text share this third line.\n"+
        "The line is also shared, but at different line numbers. The line"+
            " number shown with -d is its line number in found text.\n"+
        "The last line is similar to its counterpart, but at a different"+
            " line number. The different line number is not highlighted as"+
            " a difference.";
    
    t.equal(found, wanted, "diffs ignore line numbers");
    t.end();
});
```

Rendering their differences with line numbering, but without using the `-d` option to interleave line diffs, yields this:

![Automatic line numbering without -d](http://josephtlapp.com/elsewhere/subtap/demo-autonum-diff.png)

Rendering their differences with line numbering and the `-d` option to interleave line diffs yields this:

![Automatic line numbering with -d](http://josephtlapp.com/elsewhere/subtap/demo-autonum-diff-d.png)

### Accepting Provided Line Numbers

A far more flexible feature of `subtap` allows the text strings to arrive already containing line numbers and still not have the line numbers factor into the differences between the strings. The reason for numbering lines is to help deal with large documents, but when documents are large, they still excessively occupy the rendered output with uninformative text. Ideally, the output would only show the differences between documents, along with a little context for the differences, including line numbers.

`subtap` provides a feature that enables other tools to reduce text documents to just their differences and include line numbers in those differences. [`crumpler`](https://github.com/jtlapp/crumpler) was developed specifically for this purpose, providing both a function library and custom [`tap`](https://github.com/tapjs/node-tap) test assertions for comparing multi-line text. By not reducing documents itself, `subtap` gives users the flexibility to choose their reduction technique. This also enables TAP output to include reduced documents in place of the full lengths of large documents.

A test assertion informs `subtap` that the found or wanted value (or both) may include line numbers by placing a `lineNumberDelim` option in the assertion's `extra` values. This option takes a string that identifies the delimiter used to separate each line number from the line proper. Not all lines of the found and wanted values need contain line numbers. A line is assumed to have a line number if it begins with an integer, optionally preceded by padding spaces, and ends with the `lineNumberDelim` delimiter. Set `lineNumberDelim` to an empty string to indicate that there is no delimiter, in which case a line number ends upon encountering the first subsequent non-digit character.

Consider the following test. Normally a tool like [`crumpler`](https://github.com/jtlapp/crumpler) would reduce the documents to their differences, but they're hard-coded here to show how such tools would work:

```js
var t = require('tap');

t.test("assertion-provided line numbering", function (t) {

    var wanted =
        "0001. A tool such as crumpler has reduced two long text documents"+
            " to just their differences.\n"+
        "  ...collapsed 3499 lines...\n"+
        "3501. Here ends the first 3501 lines, common to both documents.\n"+
        "3502. This line is in both documents at different line numbers.\n"+
        "3503. This line is not the same in both documents, but the line"+
            " number is not highlighted as a difference.\n"+
        "3504. The remaining lines of the two documents show as identical,"+
            " despite having different line numbers.\n"+
        "  ...collapsed 4698 lines...\n"+
        "8203. Finally, we reach the last line of the document.\n";
        
    var found =
        "0001. A tool such as crumpler has reduced two long text documents"+
            " to just their differences.\n"+
        "  ...collapsed 3499 lines...\n"+
        "3501. Here ends the first 3501 lines, common to both documents.\n"+
        "3502. We found this unexpected line in just one document,"+
            " offsetting line numbering for the remainder of the document.\n"+
        "3503. This line is in both documents at different line numbers.\n"+
        "3504. This line is different between the documents, but the line"+
            " number is not highlighted as a difference.\n"+
        "3505. The remaining lines of the two documents show as identical,"+
            " despite having different line numbers.\n"+
        "  ...collapsed 4698 lines...\n"+
        "8204. Finally, we reach the last line of the document.\n";
    
    t.equal(found, wanted, "diffs ignore line numbers",
            { lineNumberDelim: '. ' });
    t.end();
});
```

Running this test with `subtap` and `-d` yields the following:

![Provided line numbering with -d](http://josephtlapp.com/elsewhere/subtap/demo-linenum-diff-d.png)

Notice that not all lines need have line numbers. Also notice the presence of `lineNumberDelim` among the output YAML labels.

## Other Special Features

`subtap` includes other special features such as the following:

- The output formats that print only partial test results show all work being done on the last line of the terminal window, overwriting this line as work progresses.
- When the difference between two values is a LF (`\n`), the difference will be immediately apparent because `subtap` shows the LF as `⏎` and can highlight this character in the value for which it is present.
- When the difference between two values is a trailing space, the difference will be immediately apparent because `subtap` shows trailing spaces as `·` and can highlight this character in the value for which it is present.
- Long lines are wrapped at the configured wrap margin and continued on the next line with a preceding `…` character, allowing long lines to respect indentation.
- The `strictSame()` and `strictNotSame()` assertions compare object types. `subtap` shows object class names in an `_instanceof_` property when showing differences between found and wanted values of these assertions.
- The values of found and wanted objects are displayed in Javascript syntax. This is JSON syntax with the property name unquoted where possible.
- The label `notWanted` replaces the awkward label `doNotWant` in assertions that require different found/wanted values.
- When printing the difference between found and wanted values as interleaving diff lines and the two values are identical, the YAML label is `noDiffs` instead of `diffs` to help keep you from looking for differences.

## Environment Variables

### `SUBTAP_DEFAULT_ARGS`

`SUBTAP_DEFAULT_ARGS` is a space-delimited list of default command line arguments. These arguments apply except where overridden on the command line. The command line can turn off a boolean switch (e.g. `-d` or `--diff`) by suffixing a dash (e.g. `-d-`) or prefixing `no-` (e.g. `--no-diff`).

### `SUBTAP_UNSTACK_PATHS`

`subtap` outputs the stack trace for the point at which a test assertion fails. When the assertion occurs within a callback that was handed to a library (or framework), the stack trace includes all the internal calls of the library. This trace can be needlessly long and distracting. The `SUBTAP_UNSTACK_PATHS` environment variable allows you to truncate the stack trace to remove the calls of particular libraries.

Set `SUBTAP_UNSTACK_PATHS` to a colon-delimited list of paths to libraries whose stack traces should be stripped from the output of failed assertions. All paths are treated as subpaths. A path matches a call path of the stack trace if it matches an integral series of components of the path. Call paths in the stack trace may be relative, so express paths relative to the local NPM package where possible.

For example, the following is helpful when testing with an NPM-installed instance of [webdriver.io](http://webdriver.io/):

`SUBTAP_UNSTACK_PATHS=node_modules/webdriverio`

### `SUBTAP_COLOR_FILE`

`SUBTAP_COLOR_FILE` is a path to a YAML file specifying color overrides. The path may be relative to the current working directory. The file associates the following style names with [ANSI escape codes](https://en.wikipedia.org/wiki/ANSI_escape_code):

```
  pass - style for name of a passing assertion or subtest
  root-fail - style for name of a failed root subtest
  fail - style for other lines reporting errors or failures
  found - style of background for a found value
  wanted - style of background for a wanted value
  same - style of background for a non-differing diff line
  bad - style for marking found text that was not wanted
  good - style for marking wanted text that was not found
  label1 - style for a primary YAML label
  label2 - style for a secondary YAML label
```

See [this color chart](https://upload.wikimedia.org/wikipedia/en/1/15/Xterm_256color_chart.svg) for the available colors. For example, to make primary labels orange, include the following line in the `SUBTAP_COLOR_FILE` file:

```YAML
label1: "\e[38;5;166m"
```

Here are the defaults for **16-color** terminals:

```YAML
pass: "\e[32m" # dark green text
root-fail: "\e[97m\e[101m" # bright white on bright red background
fail: "\e[31m" # dark red text
found: "\e[103m" # bright yellow background
wanted: "\e[106m" # bright cyan background
same: "\e[47m" # light gray background
bad: "\e[31m" # dark red text
good: "\e[32m" # dark green text
label1: "" # default text color
label2: "\e[90m" # gray text
```

Here are the defaults for **256-color** terminals:

```YAML
pass: "\e[38;5;022m" # dark green text
root-fail: "\e[38;5;124m\e[48;5;224m" # dark red on light red
fail: "\e[31m" # dark red text
found: "\e[48;5;225m" # light pink background
wanted: "\e[48;5;194m" # light green background
same: "\e[48;5;230m" # light yellow background
bad: "\e[31m" # dark red text
good: "\e[38;5;022m" # dark green text
label1: "" # default text color
label2: "\e[38;5;242m" # gray text
```

These default colors are designed for a white background.

## Example Output

The images below are snapshots of the output of running `subtap` on the following test file:

```js
var tap = require('tap');

class ClassA {
    constructor (x, y) { this.x = x; this.y = y; }
}

class ClassB {
    constructor (x, y) { this.x = x; this.y = y; }
}       

tap.test("unequal but should be equal", function (t) {
    t.equal("with a sudtle difference", "with a subtle difference");
    t.equal("line 1\nline 2", "line 1\nline 2\n", "missing LF");
    t.equal(1234, "1234", "an integer and a string");
    t.equal({ x: 1, y: 2 }, { x: 1, y: 3 });
    t.strictSame(new ClassA(1, 2), new ClassB(1, 2), "different classes");
    t.end();
});

tap.test("equal but should be unequal", function (t) {
    t.notEqual(-1, -1, "don't want -1");
    t.notEqual("line 1 \nline 2  ", "line 1 \nline 2  ",
            "with trailing spaces");
    t.notEqual("123", "123", "clearly a string");
    t.end();
});
```

The image on the left is the output when not interleaving line differences. The image on the right is the output when interleaving line differences using the `-d` option. Click on an image to see it full size.

&nbsp;&nbsp;&nbsp;&nbsp;<a href="http://josephtlapp.com/elsewhere/subtap/demo-no-diff.png"><img align="top" src="http://josephtlapp.com/elsewhere/subtap/demo-no-diff-thumb.png" /></a>&nbsp;&nbsp; <a href="http://josephtlapp.com/elsewhere/subtap/demo-diff.png"><img align="top" src="http://josephtlapp.com/elsewhere/subtap/demo-diff-thumb.png" /></a>

## Thanks

Thank you [@isaacs](https://github.com/isaacs) for your endless patience helping me get up to speed on `tap`, node, and even Javascript. Thank you [@ljharb](https://github.com/ljharb) for your input on my first iteration attempt originally based on `tape`. Thank you [@substack](https://github.com/substack) for inspiring me with [`faucet`](https://github.com/substack/faucet) and [`tape`](https://github.com/substack/tape).

## LICENSE

This software is released under the MIT license:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Copyright © 2016 Joseph T. Lapp