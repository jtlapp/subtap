# subtap

a test runner for [`tap`](https://github.com/tapjs/node-tap) that selectively runs subtests

## BETA RELEASE

This is a beta release of `subtap` for the purpose of getting initial feedback. Once I have some confidence that the generated output is reasonable and relatively stable, I'll produce a test suite for it and release version 1.0.0.

## Overview

`subtap` is a test runner for debugging test suites by selectively running subtests. It is optionally also a TAP pretty-printer that emphasizes making even subtle differences between found and wanted values obvious at a glance.

`subtap` organizes debugging around root subtests. A "root subtest" is a test whose parent is a file's root `tap` test. `subtap` numbers the root subtests across all of the test files. You can rerun root subtests by indicating their numbers, have the debugger break at the start of each root subtest, and bail out of the test runner after a given number of root subtest failures.

You control `subtap`'s output format. You can have it filter subtests for TAP output or you can pretty-print YAML-like output, optionally showing test results in JSON. The pretty-printing strives to clearly show differences between the found and wanted values of test assertions, including aligning values for vertical comparison and highlighting differences in non-printable characters. You can also show differences as interleaving diff lines. ([example output](#example-output))

This tool only works with tests that employ the [`tap`](https://github.com/tapjs/node-tap) module.

## Why another test runner?

This test runner is for debugging. It employs [`tap`](https://github.com/tapjs/node-tap), so you can run your tests with `tap` too. But `subtap` is for debugging. With `subtap` you can:

- Select subtests to rerun by number, even across files, running no others.
- Have a debugger automatically break at the start of each root subtest.
- Bail out after a specified number of root subtests fail.
- Optionally exit when your code throws an unexpected exception, instead of having it logged as a test failure and plowing on with testing.
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

  -d --diff            Compare found and wanted values by interleaving diff
                       lines. (Values otherwise display consecutively.)

  --debug[=<p>]        Receive debugger client on port <p> (default 5858),
                       breaking only at breakpoints in test files. Sets -t0.

  --debug-brk[=<p>]    Receive debugger client on port <p> (default 5858) with
                       breakpoints at start of each root subtest. Sets -t0.

  --debug-port=<p>     Set default debug port to <p> instead of 5858. Useful in
                       SUBTAP_ARGS to shorten --debug and --debug-brk arguments.

  -e --log-exceptions  Catch and report subtest exceptions as failed assertions.
                       Root test exceptions always terminate the run because
                       they interrupt the numbering of root subtests.

  -f --full-functions  When found/wanted values reference functions, show the
                       function source code in addition to the signature.

  -h --help            Show this help information.

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

The debugger runs as a separate process from `subtap`. By default, node serves the debugger on port 5858. You can select a different port `<p>` using the options `--debug=<p>` or `--debug-brk=<p>`. If you consistently use a different port, you can make your preferred port the default by adding `--debug-port=<p>` to the SUBTAP_ARGS environment variable. For example, placing `--debug-port=5859` in SUBTAP_ARGS would cause `--debug` on the command line to use port 5859, without having to fully specify `--debug=5859`.

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

### `SUBTAP_ARGS`

`SUBTAP_ARGS` is a space-delimited list of default command line arguments. These arguments apply except where overridden on the command line. The command line can turn off a boolean switch (e.g. `-d` or `--diff`) by suffixing a dash (e.g. `-d-`) or prefixing `no-` (e.g. `--no-diff`).

### `SUBTAP_COLOR`

`SUBTAP_COLOR` is a path to a YAML file specifying color overrides. The path may be relative to the current working directory. The file associates the following style names with [ANSI escape codes](https://en.wikipedia.org/wiki/ANSI_escape_code):

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

See [this color chart](https://upload.wikimedia.org/wikipedia/en/1/15/Xterm_256color_chart.svg) for the available colors. For example, to make primary labels orange, include the following line in the `SUBTAP_COLOR` file:

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