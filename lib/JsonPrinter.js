/******************************************************************************
JsonPrinter outputs TAP events as a JSON array of events. Each event is an array of the form [eventName, eventData].
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');

var TapReceiver = require('./TapReceiver');
var helper = require('./helper');

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _tabSize - width of JSON tab indentation in spaces, or 0 to output compact
// _truncateStackAtPath - call path at which to truncate call stacks
// _writeFunc - function(text) for outputting generated text

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _dumpStarted - whether any events have been dumped in JSON
// _dumpTestDepth - test nesting depth during JSON even dump

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * Construct a JsonPrinter.
 *
 * @param printerOptions An optional set of the following options:
 *   - tabSize: Number of spaces by which to indent each nested level of JSON, or 0 to emit without indentation (defaults to 0)
 *   - truncateStackAtPath: Path of file in call stack at which to abbreviate stack to just this path (defaults to null for no truncation)
 *   - writeFunc: Function(text) for outputting generated text; defaults to a function that writes to stdout
 * @param streamOptions Options for configuring a stream.Writable
 */

function JsonPrinter (printerOptions, streamOptions) {
    TapReceiver.call(this, streamOptions);
    printerOptions = printerOptions || {};
    this._tabSize = printerOptions.tabSize || 0;
    this._truncateStackAtPath = printerOptions.truncateStackAtPath || null;
    this._writeFunc = printerOptions.writeFunc || function(text) {
        process.stdout.write(text);
    };

    this._dumpStarted = false;
    this._dumpTestDepth = 0;
}
util.inherits(JsonPrinter, TapReceiver);
module.exports = JsonPrinter;

//// EVENT HANDLERS ///////////////////////////////////////////////////////////

JsonPrinter.prototype.assertHandler = function (assert) {
    this._blockExceptions(function() {
        if (this._truncateStackAtPath)
            helper.truncateAssertStacks(assert, this._truncateStackAtPath);
        this._writeEvent('assert', assert);
    }.bind(this));
};

JsonPrinter.prototype.bailoutHandler = function (reason) {
    this._blockExceptions(function() {
        this._writeEvent('bailout', reason);
        this._writeFunc("\n]\n");
    }.bind(this));
};

JsonPrinter.prototype.childHandler = function (childParser) {
    this._blockExceptions(function() {
        this._setupParser(childParser);
        this._writeEvent('child', "<childParser>");
        ++this._dumpTestDepth;
    }.bind(this));
};

JsonPrinter.prototype.commentHandler = function (comment) {
    this._blockExceptions(function() {
        this._writeEvent('comment', comment);
    }.bind(this));
};

JsonPrinter.prototype.completeHandler = function (results) {
    this._blockExceptions(function() {
        this._writeEvent('complete', results);
        if (this._dumpTestDepth === 0)
            this._writeFunc("\n]\n");
        else
            --this._dumpTestDepth;
    }.bind(this));
};

JsonPrinter.prototype.extraHandler = function (extra) {
    this._blockExceptions(function() {
        this._writeEvent('extra', extra);
    }.bind(this));
};

JsonPrinter.prototype.planHandler = function (plan) {
    this._blockExceptions(function() {
        this._writeEvent('plan', plan);
    }.bind(this));
};

JsonPrinter.prototype.versionHandler = function (version) {
    this._blockExceptions(function() {
        this._writeEvent('version', version);
    }.bind(this));
};

//// RESTRICTED METHODS ///////////////////////////////////////////////////////

JsonPrinter.prototype._writeEvent = function (eventName, eventData) {
    if (this._dumpStarted)
        this._writeFunc(",\n\n");
    else {
        this._writeFunc("[\n");
        this._dumpStarted = true;
    }
    this._writeFunc("{'event':'"+ eventName +"', 'data':");
    this._writeFunc(JSON.stringify(eventData, "  "));
    this._writeFunc("}");
};
