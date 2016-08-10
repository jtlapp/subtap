/******************************************************************************
SubtapPrinter
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var yaml = require('js-yaml');
var _ = require('lodash');

var ConsoleFormat = require('./lib/ConsoleFormat');
var states = require('./lib/states');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var BULLET_CHAR = '-';
var FAIL_CHAR = '⨯';
var PASS_CHAR = '✓';
var ROOT_TEST_QUALIFIER = "root"; // qualifier for root-level tests

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _prettyMode - SubtapPrinter.SHOW_* mode in which to output test data
// _dumpEvents - whether in mode SubtapPrinter.SHOW_EVENTS (derived)
// _writer - Writer stream to which to output prettied text
// _tabSize - number of spaces to use for each indented level
// _format - instance of ConsoleFormat used for formatting output
// _filterStackFromPath - path of file at which to trunctate stack, or null
// _stackFilterRegex - RegExp that finds _filterStackFromPath in a stack
// _testNameRegex - RegExp that separates test name from test file

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _dumpStarted - whether any events have been dumped in JSON
// _dumpTestDepth - test nesting depth during JSON even dump
// _testNameStack - stack of parent test names; empty => no named parent
// _testDepthShown - depth of _testNameStack for which test names are shown
// _counts - object having the following properties:
//   rootTests - count of root-level named tests
//   nestedTests - count of tests nested under root-level tests
//   assertions - count of all assertions (excludes test counts)
//   failedRootTests - count of failed root-level named tests
//   failedNestedTests - count of failed tests nested under root-level tests
//   failedAssertions - count of all failed assertions (excludes test counts)
// _state - object that receives evens for current state
// _terminated - whether to stop receiving events due to an internal error

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * Construct a SubtapPrinter that reads the provided instance of tap-parser.
 *
 * @param tapParser - an instance of the 'tap-parser' module that is receiving the TAP output
 * @param options - an optional set of the following options:
 *   - prettyMode: mode in which to output test data. Value is one of the SubtapPrinter.SHOW_* constants. Defaults to SubtapPrinter.SHOW_ALL.
 *   - tabSize: number of spaces by which to indent each level of text (defaults to 2)
 *   - monochrome: true => show all text in default color, while still allowing bold (defaults to false)
 *   - filterStackFromPath: path of file in call stack to filter out of call stack by abbreviating to just this path (defaults to null for no stack filter)
 */

function SubtapPrinter (tapParser, options) {
    options = options || {};
    this._prettyMode = options.prettyMode || SubtapPrinter.SHOW_ALL;
    this._dumpEvents = (this._prettyMode === SubtapPrinter.SHOW_EVENTS);
    this._writer = options.outputWriter || process.stdout;
    this._tabSize = options.tabSize || 2;
    this._filterStackFromPath = options.filterStackFromPath || null;
    if (this._filterStackFromPath) {
        this._stackFilterRegex = new RegExp("\n( *(?:at )?).*"+
                _.escapeRegExp(this._filterStackFromPath) +":[0-9:]+");
    }
    this._format = new ConsoleFormat({
        tabSize: this._tabSize,
        clearToEnd: (this._prettyMode !== SubtapPrinter.SHOW_ALL),
        monochrome: options.monochrome || false
    });
    this._testNameRegex = new RegExp("^(.+?)( \\(.+:[0-9]+\\))?$");

    this._dumpStarted = false;
    this._dumpTestDepth = 0;
    this._testNameStack = [];
    this._testDepthShown = 0;
    this._terminated = false;
    this._setupParser(tapParser);
    states.install(this);
}
module.exports = SubtapPrinter;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

SubtapPrinter.SHOW_ALL = 0; // show all tests and assertions, even passing ones
SubtapPrinter.SHOW_FAILURES = 1; // only show failing tests and assertions
SubtapPrinter.SHOW_ROOT = 2; // only show failures and root-level tests
SubtapPrinter.SHOW_EVENTS = 3; // output events in JSON

//// EVENT HANDLERS ///////////////////////////////////////////////////////////

SubtapPrinter.prototype._assertHandler = function (assert) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this.printEvent('assert', assert);
        else
            this._state.assertHandler(assert);
    }.bind(this));
};

SubtapPrinter.prototype._bailoutHandler = function (reason) {
    this._blockExceptions(function() {
        if (this._dumpEvents) {
            this.printEvent('bailout', reason);
            this.print("\n]\n");
        }
        else {
            var text = this._format.red(BULLET_CHAR +" BAIL OUT! "+ reason);
            this.printBlankLine();
            this.print(this._format.line(0, text) + "\n");
        }
    }.bind(this));
};

SubtapPrinter.prototype._childHandler = function (childParser) {
    this._blockExceptions(function() {
        this._setupParser(childParser);
        if (this._dumpEvents) {
            this.printEvent('child', "<childParser>");
            ++this._dumpTestDepth;
        }
        else
            this._state.childHandler(childParser);
    }.bind(this));
};

SubtapPrinter.prototype._commentHandler = function (comment) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this.printEvent('comment', comment);
        else
            this._state.commentHandler(comment);
    }.bind(this));
};

SubtapPrinter.prototype._completeHandler = function (results) {
    this._blockExceptions(function() {
        if (this._dumpEvents) {
            this.printEvent('complete', results);
            if (this._dumpTestDepth === 0)
                this.print("\n]\n");
            else
                --this._dumpTestDepth;
        }
        else
            this._state.completeHandler(results);
    }.bind(this));
};

SubtapPrinter.prototype._extraHandler = function (extra) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this.printEvent('extra', extra);
        else
            this._state.extraHandler(extra);
    }.bind(this));
};

SubtapPrinter.prototype._planHandler = function (plan) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this.printEvent('plan', plan);
        else
            this._state.planHandler(plan);
    }.bind(this));
};

SubtapPrinter.prototype._versionHandler = function (version) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this.printEvent('version', version);
        else
            this._state.versionHandler(version);
    }.bind(this));
};

//// PRINT SERVICES ///////////////////////////////////////////////////////////

SubtapPrinter.prototype.print = function (line) {
    this._writer.write(line);
};

SubtapPrinter.prototype.printBlankLine = function () {
    if (this._dots)
        this.print("\r"+ this._format.lineEnd());
    this.print("\n");
};

SubtapPrinter.prototype.printComment = function (comment) {
    if (!this._dots || this._testNameStack.length === 0) {
        this.print(this._format.line(this._indentLevel(), comment));
        if (comment[comment.length - 1] !== "\n")
            this.print("\n");
    }
};

SubtapPrinter.prototype.printEvent = function (eventName, eventData) {
    if (this._dumpStarted)
        this.print(",\n\n");
    else {
        this.print("[\n");
        this._dumpStarted = true;
    }
    this.print("{'event':'"+ eventName +"', 'data':");
    this.print(JSON.stringify(eventData, "  "));
    this.print("}");
};

SubtapPrinter.prototype.printFailedAssertion = function (assert) {
    this._printTestContext();
    this._abbreviateAssertion(assert);
    var firstLine = "not ok "+ assert.id +" - "+ assert.name;
    if (assert.time)
        firstLine += " # time="+ assert.time +"ms";
    firstLine =
        this._format.bold(this._format.red(FAIL_CHAR +" "+ firstLine));
    this.print(this._format.line(this._indentLevel(), firstLine) +"\n");
    
    var diagText = yaml.safeDump(assert.diag, { indent: this._tabSize });
    this.print(this._format.multiline(this._indentLevel() + 1, diagText));
};

SubtapPrinter.prototype.printPassedAssertion = function (assert) {
    if (this._dots) {
        if (this._dots === 1 || ++this._dotCount === this._dots) {
            this._dotCount = 0;
            this.print('.');
        }
    }
    else {
        this._printTestContext();
        var text = PASS_CHAR +" ok "+ assert.id +" - "+ assert.name;
        this.print(this._format.line(this._indentLevel(), text) +"\n");
    }
};

SubtapPrinter.prototype.printTestHeader = function () {
    if (!this._dots || this._testNameStack.length === 1)
        this._printTestContext();
};

SubtapPrinter.prototype.printTestClosing = function (results) {
    if (this._testNameStack.length === 0)
        this._printRunResults(results);
    else {
        if (this._testNameStack.length === 1)
            this._printTestResults(results);
        // ignore results for tests nested within root-level tests
        
        if (this._testDepthShown === this._testNameStack.length)
            --this._testDepthShown;
    }
};

//// SUPPORT METHODS //////////////////////////////////////////////////////////

SubtapPrinter.prototype._abbreviateAssertion = function (assert) {
    if (assert.ok)
        throw new Error("Can only abbreviate failed assertions");
    if (assert.diag) {
        this._abbreviateStack(assert.diag);
        if (assert.diag.stack && assert.diag.at)
            delete assert.diag['at'];
    }
    if (assert.diag.found)
        this._abbreviateStack(assert.diag.found);
};

SubtapPrinter.prototype._abbreviateStack = function (stackHolder) {
    var stack = stackHolder.stack;
    if (stack && this._filterStackFromPath !== null) {
        var matches = stack.match(this._stackFilterRegex);
        if (matches !== null) {
            stack = stack.substr(0, matches.index + 1 + matches[1].length);
            stack += "...("+ this._filterStackFromPath +")...\n";
            stackHolder.stack = stack;
        }
    }
};

SubtapPrinter.prototype._blockExceptions = function (handler) {
    if (this._terminated)
        return;
    try {
        handler();
    }
    catch (err) {
        this._exitWithError(err);
    }
};

SubtapPrinter.prototype._exitWithError = function (err) {
    // don't throw the exception up to the parser, because the parser will
    // hand it to tap, and tap sometimes emits it as a failed assertion.
    // this may not be an bug in tap, because tap is supposed to catch and
    // report exceptions that occur while running a test.
    
    this._terminated = true;
    process.stderr.write("\n"+ err.stack +"\n");
    process.exit(1);
};

SubtapPrinter.prototype._indentLevel = function (parser) {
   return this._testNameStack.length;
};

SubtapPrinter.prototype._parseTestName = function (testName) {
    var matches = testName.match(this._testNameRegex);
    return {
        name: matches[1],
        file: matches[2]
    };
};

SubtapPrinter.prototype._printTestResults = function (results) {
    if (this._dots) {
        var fullName = this._testNameStack[this._testNameStack.length - 1];
        var nameParse = this._parseTestName(fullName);
        var text;
        this.print("\r"+ this._format.UP_LINE);
        if (results.ok)
            text = this._format.green(PASS_CHAR +" "+ nameParse.name);
        else
            text = this._format.red(FAIL_CHAR +" "+ nameParse.name);
        if (nameParse.file)
            text += nameParse.file;
        this.print(this._format.line(this._indentLevel() - 1, text) +"\n");
        this.print(this._format.CLEAR_END +"\r");
    }
};

SubtapPrinter.prototype._printRunResults = function (results) {
    var text;
    if (results.ok) {
        // "Passed all N root tests, all N assertions"
        text = "Passed all "+
            this._counts.rootTests +" "+ ROOT_TEST_QUALIFIER +" tests, all "+
            this._counts.assertions +" assertions";
        text = this._format.bold(this._format.green(text));
    }
    else {
        // "Failed n of N root tests, n of N assertions"
        text = "Failed "+
            this._counts.failedRootTests +" of "+ this._counts.rootTests +" "+
                    ROOT_TEST_QUALIFIER +" tests, "+
            this._counts.failedAssertions +" of "+ this._counts.assertions +
                    " assertions";
        text = this._format.bold(this._format.red(text));
    }
    this.print(this._format.line(0, text) +"\n\n");
};

SubtapPrinter.prototype._printTestContext = function () {
    while (this._testDepthShown < this._testNameStack.length) {
        var fullName = this._testNameStack[this._testDepthShown];
        var nameParse = this._parseTestName(fullName);
        var text = BULLET_CHAR +" "+ nameParse.name;
        if (!this._dots)
            text = this._format.bold(text);
        if (nameParse.file)
            text += nameParse.file;
        this.print(this._format.line(this._indentLevel() - 1, text) +"\n");
        ++this._testDepthShown;
    }
};

SubtapPrinter.prototype._setupParser = function (parser) {
    parser.on('assert', this._assertHandler.bind(this));
    parser.on('bailout', this._bailoutHandler.bind(this));
    parser.on('child', this._childHandler.bind(this));
    parser.on('comment', this._commentHandler.bind(this));
    parser.on('complete', this._completeHandler.bind(this));
    parser.on('extra', this._extraHandler.bind(this));
    parser.on('plan', this._planHandler.bind(this));
    parser.on('version', this._versionHandler.bind(this));
};
