# subtap

A test runner for [`tap`](https://github.com/tapjs/node-tap) that selectively runs subtests

## BETA RELEASE

This is a beta release of `subtap` for the purpose of getting initial feedback. Once I have some confidence that the generated output is reasonable and relatively stable, I'll produce a test suite for it and release version 1.0.0. At that point it will be open to contributions from others.

`subtap` is not yet working with the recent `tap` 7.0.0 release.

## Overview

`subtap` is a test runner for debugging test suites by selectively running subtests. It is also a TAP pretty-printer that emphasizes making differences between found and wanted values obvious at a glance.

`subtap` numbers the root subtests across all of the test files. A "root subtest" is a test whose parent is the root `tap` test of a file. The `-r` option provides test numbers and restricts the run to only those tests. The user can also control whether the test run exits when a subtest throws an exception and how many root subtests may fail before bailing out of the test run.

When the found and wanted values of a test assertion differ, `subtap` can emphasize the first differing character and the differing text. It shows LFs (`\n`) in text and trailing spaces as visible characters, and it aligns values for proper vertical comparison. The differences between values may also be shown as interleaving diff lines.

This tool only works with tests that employ the [`tap` module](https://github.com/tapjs/node-tap).

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

  --tap    Output the raw TAP text.

  --json   Output 'tap-parser' module events in a JSON array.
```

## Additional Options

`subtap` also provides the following options. The `-bN` and `-r` options most
distinguish subtap from other `tap` test runners. They allow the user to quickly
isolate and focus on problematic root subtests.

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

  -e --log-exceptions  Catch and report subtest exceptions as failed assertions.
                       Root test exceptions always terminate the run because
                       they interrupt the numbering of root subtests.

  -f --full-functions  When found/wanted values reference functions, show the
                       function source code in addition to the signature.

  -h --help            Show this help information.

  -r<m> --run=<m>      Only run the tests that <m> lists. <m> is a subtest
                       number (e.g. -r10) or a range of subtest numbers (e.g.
                       -r10..14) or a comma-delimited list of subtest numbers
                       and ranges (e.g. -r7,10..14,16). Spaces are not allowed.

  -tN --timeout=N      Timeout after N milliseconds of inactivity. To disable
                       the timeout, set N to 0. (default -t3000, or 3 seconds)

  --mark=<f>[:<g>]     Mark differences between found & wanted values according
                       to flags. --mark=<f> sets flags <f> for all difference
                       comparisons. --mark=<f>:<g> sets flags <f> for comparing
                       consecutive values and flags <g> for comparing adjacent
                       diff lines (see -d, --diff). (default --mark=BCR:BC)
                       
                         B: bold (differing text shown in bold)
                         C: color (differing text shown in color)
                         R: reverse-video the first different character
                         _: turn off flags (e.g. --mark=BR:_)

  --node-arg=<arg>     Pass <arg> to the node process in which the test file
                       runs. The argument is NOT placed in the test file's
                       process.argv. [This is broken at the moment.]

  --tab=N              Indent each nested level by N spaces. (default --tab=2)

  --wrap=M:N           Wrap output at column N, but don't wrap found/wanted
                       values at less than M chars wide. (default --wrap=20:80)
```

## Other Special Features

`subtap` includes other special features such as the following:

- The output formats that print only partial test results show all work being done on the last line of the terminal window, overwriting this line as work progresses.
- When the difference between two values is a LF (`\n`), the difference will be immediately apparent because `subtap` shows the LF as `⏎` and can highlight this character in the value for which it is present.
- When the difference between two values is a trailing space, the difference will be immediately apparent because `subtap` shows trailing spaces as `·` and can highlight this character in the value for which it is present.
- Long lines are wrapped at the configured wrap margin and continued on the next line with a preceding `…` character, allowing long lines to respect indentation.
- The `strictSame()` and `strictNotSame()` assertions compare object types. `subtap` shows object class names in an `_instanceof_` property when showing differences between found and wanted values of these assertions.
- The values of found and wanted objects are displayed in Javascript syntax. This is JSON syntax with the property name unquoted where possible.
- When printing the difference between found and wanted values as interleaving diff lines and the two values are identical, the YAML label is `noDiffs` instead of `diffs` to help keep you from looking for differences.

## Environment Variables

### `SUBTAP_ARGS`

`SUBTAP_ARGS` is a space-delimited list of default command line arguments. These arguments apply except where overridden on the command line. The command line can turn off a boolean switch (e.g. `-d` or `--diff`) by suffixing a dash (e.g. `-d-`) or prefixing `no-` (e.g. `--no-diff`).

### `SUBTAP_COLOR`

`SUBTAP_COLOR` is a path to a YAML file specifying color overrides. The path may be relative to the current working directory. The file associates the following style names with ANSI escape code strings:

```
  pass - style for name of a passing assertion or subtest
  root-fail - style for name of a failed root subtest
  fail - style for other lines reporting errors or failures
  found - style of background for a found value
  wanted - style of background for a wanted value
  same - style of background for a non-differing diff line
  bad - style for marking found text that was not wanted
  good - style for marking wanted text that was not found
  label - style for a secondary YAML label
```

For example, to make secondary labels orange, include the following line in the `SUBTAP_COLOR` file:

```YAML
label: "\e[38;5;166m"
```

Here are the defaults for **16-color** terminals:

```YAML
pass: "\e[32m"
root-fail: "\e[97m\e[101m"
fail: "\e[31m"
found: "\e[103m"
wanted: "\e[106m"
same: "\e[47m"
bad: "\e[31m"
good: "\e[32m"
label: "\e[90m"
```

Here are the defaults for **256-color** terminals:

```YAML
pass: "\e[38;5;022m"
root-fail: "\e[38;5;124m\e[48;5;224m"
fail: "\e[31m"
found: "\e[48;5;225m"
wanted: "\e[48;5;194m"
same: "\e[48;5;230m"
bad: "\e[31m"
good: "\e[38;5;022m"
label: "\e[38;5;242m"
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

<div style="width:300px; margin-left:20px; float:left"><a href="http://josephtlapp.com/elsewhere/subtap/demo-no-diff.png" target="_subtap"><img style="max-width:100%" src="http://josephtlapp.com/elsewhere/subtap/demo-no-diff.png" alt="$ subtap -d-" title="normal output" /></a></div>
<div style="width:300px; margin-left:20px; float:left"><a href="http://josephtlapp.com/elsewhere/subtap/demo-diff.png" target="_subtap"><img style="max-width:100%" src="http://josephtlapp.com/elsewhere/subtap/demo-diff.png" alt="$ subtap -d-" title="diffs output" /></a></div>
<div style="clear:both"></div>

## Thanks

Thank you [@isaacs](https://github.com/isaacs) for your endless patience helping me get up to speed on `tap`, node, and even Javascript. Thank you [@ljharb](https://github.com/ljharb) for your input on my first iteration attempt originally based on `tape`. Thank you [@substack](https://github.com/substack) for inspiring me with [`faucet`](https://github.com/substack/faucet) and [`tape`](https://github.com/substack/tape).

## TO DO

Some crucial features remain to be added. In particular:

- Facilities for running the test file in a debugger.
- Passing arguments to the the test file's instance of node.
- Detect whether terminal has a black background, and if so, default the color scheme to something reasonable for the background.

## LICENSE

This software is released under the MIT license:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Copyright © 2016 Joseph T. Lapp