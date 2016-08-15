/******************************************************************************
SubtapPrinter
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var _ = require('lodash');

var states = require('./lib/states');
var reports = require('./lib/reports');

//// PRIVATE CONSTANTS ////////////////////////////////////////////////////////

var REPORTS = [
    reports.FullReport,
    reports.RootTestReport,
    reports.FailureReport
];

var DIFF_HIGHLIGHT_MARGIN = 80; // right margin of multiline highlights
var MIN_DIFF_HIGHLIGHT_WIDTH = 30; // min. width of multiline highlights

var REGEX_CANONICAL = new RegExp("(\r|\x1b\\[F|\x1b)", 'g');

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _prettyMode - SubtapPrinter.SHOW_* mode in which to output test data
// _dumpEvents - whether in mode SubtapPrinter.SHOW_EVENTS (derived)
// _report - instance of AbstractReport that formats for the output mode
// _writer - Writer stream to which to output prettied text
// _filterStackFromPath - path of file at which to trunctate stack, or null
// _stackFilterRegex - RegExp that finds _filterStackFromPath in a stack
// _canonical - whether to output in a test-verifiable form

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _dumpStarted - whether any events have been dumped in JSON
// _dumpTestDepth - test nesting depth during JSON even dump
// _testStack - stack of parses of names of currently active tests
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
 *   - canonical: true => output as sequential test-verifiable lines
 */

function SubtapPrinter (tapParser, options) {

    // establish output mode
    
    options = options || {};
    this._prettyMode = options.prettyMode || SubtapPrinter.SHOW_ALL;
    this._dumpEvents = (this._prettyMode === SubtapPrinter.SHOW_EVENTS);
    this._canonical = options.canonical || false;
    
    // configure the options
    
    this._writer = options.outputWriter || process.stdout;
    this._filterStackFromPath = options.filterStackFromPath || null;
    if (this._filterStackFromPath) {
        this._stackFilterRegex = new RegExp("\n( *(?:at )?).*"+
                _.escapeRegExp(this._filterStackFromPath) +":[0-9:]+");
    }
    if (!this._dumpEvents) {
        var Report = REPORTS[this._prettyMode];
        this._report = new Report(this, {
            tabSize: options.tabSize || 2,
            styleMode: options.colorMode,
            highlightMargin: DIFF_HIGHLIGHT_MARGIN,
            minHighlightWidth: MIN_DIFF_HIGHLIGHT_WIDTH
        });
    }
    
    // initialize state variables

    this._dumpStarted = false;
    this._dumpTestDepth = 0;
    this._testStack = [];
    this._terminated = false;
    this._setupParser(tapParser);
    states.install(this);
}
module.exports = SubtapPrinter;

//// PUBLIC CONSTANTS /////////////////////////////////////////////////////////

SubtapPrinter.SHOW_ALL = 0; // show all tests and assertions, even passing ones
SubtapPrinter.SHOW_ROOT = 1; // only show failures and root-level tests
SubtapPrinter.SHOW_FAILURES = 2; // only show failing tests and assertions
SubtapPrinter.SHOW_EVENTS = 3; // output events in JSON

//// EVENT HANDLERS ///////////////////////////////////////////////////////////

SubtapPrinter.prototype._assertHandler = function (assert) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this._printEvent('assert', assert);
        else
            this._state.assertHandler(assert);
    }.bind(this));
};

SubtapPrinter.prototype._bailoutHandler = function (reason) {
    this._blockExceptions(function() {
        if (this._dumpEvents) {
            this._printEvent('bailout', reason);
            this._print("\n]\n");
        }
        else
            this._state.bailoutHandler(reason);
    }.bind(this));
};

SubtapPrinter.prototype._childHandler = function (childParser) {
    this._blockExceptions(function() {
        this._setupParser(childParser);
        if (this._dumpEvents) {
            this._printEvent('child', "<childParser>");
            ++this._dumpTestDepth;
        }
        else
            this._state.childHandler(childParser);
    }.bind(this));
};

SubtapPrinter.prototype._commentHandler = function (comment) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this._printEvent('comment', comment);
        else
            this._state.commentHandler(comment);
    }.bind(this));
};

SubtapPrinter.prototype._completeHandler = function (results) {
    this._blockExceptions(function() {
        if (this._dumpEvents) {
            this._printEvent('complete', results);
            if (this._dumpTestDepth === 0)
                this._print("\n]\n");
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
            this._printEvent('extra', extra);
        else
            this._state.extraHandler(extra);
    }.bind(this));
};

SubtapPrinter.prototype._planHandler = function (plan) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this._printEvent('plan', plan);
        else
            this._state.planHandler(plan);
    }.bind(this));
};

SubtapPrinter.prototype._versionHandler = function (version) {
    this._blockExceptions(function() {
        if (this._dumpEvents)
            this._printEvent('version', version);
        else
            this._state.versionHandler(version);
    }.bind(this));
};

//// PRINT SERVICES ///////////////////////////////////////////////////////////

SubtapPrinter.prototype._print = function (text) {
    if (this._canonical) {
        text = text.replace(REGEX_CANONICAL, function (match) {
            switch (match) {
                case "\r":
                    return "\\r\n";
                case "\x1b[F":
                    return "\\^";
                case "\x1b":
                    return "\\e";
            }
            return match;
        });
    }
    this._writer.write(text);
};

SubtapPrinter.prototype._printEvent = function (eventName, eventData) {
    if (this._dumpStarted)
        this._print(",\n\n");
    else {
        this._print("[\n");
        this._dumpStarted = true;
    }
    this._print("{'event':'"+ eventName +"', 'data':");
    this._print(JSON.stringify(eventData, "  "));
    this._print("}");
};

//// SUPPORT METHODS //////////////////////////////////////////////////////////

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
