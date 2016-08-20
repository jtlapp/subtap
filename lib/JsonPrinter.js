/******************************************************************************
JsonPrinter outputs TAP events as a JSON array of events. Each event is an array of the form [eventName, eventData].
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');

var TapReceiver = require('./TapReceiver');
var helper = require('./helper');

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _outputStream - stream to which to write output (a node Writable)
// _tabSize - width of JSON tab indentation in spaces, or 0 to output compact
// _truncateStackAtPath - call path at which to truncate call stacks

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _started - whether any events have been output yet
// _testDepth - current test nesting depth

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * Construct a JsonPrinter.
 *
 * @param outputStream Stream to which to write output (a node Writable)
 * @param printerOptions An optional set of the following options:
 *   - tabSize: Number of spaces by which to indent each nested level of JSON, or 0 to emit without indentation (defaults to 0)
 *   - truncateStackAtPath: Path of file in call stack at which to abbreviate stack to just this path (defaults to null for no truncation)
 *   - closeOutputStream: whether to call end() on the output stream (defaults to false, which is usual for stdout)
 * @param inputStreamOptions Options for configuring a stream.Writable
 */

function JsonPrinter (outputStream, printerOptions, inputStreamOptions) {
    TapReceiver.call(this, inputStreamOptions);
    this._outputStream = outputStream;
    printerOptions = printerOptions || {};
    this._tabSize = printerOptions.tabSize || 0;
    this._truncateStackAtPath = printerOptions.truncateStackAtPath || null;
    this._closeOutputStream = printerOptions.closeOutputStream || false;

    this._started = false;
    this._testDepth = 0;
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
    }.bind(this));
};

JsonPrinter.prototype.childHandler = function (childParser) {
    this._blockExceptions(function() {
        this._setupParser(childParser);
        this._writeEvent('child', "<childParser>");
        ++this._testDepth;
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
        if (this._testDepth === 0) {
            this._outputStream.write("\n]\n");
            if (this._closeOutputStream)
                this._outputStream.end();
        }
        else
            --this._testDepth;
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
    if (this._started)
        this._outputStream.write(",\n\n");
    else {
        this._outputStream.write("[\n");
        this._started = true;
    }
    this._outputStream.write("{'event':'"+ eventName +"', 'data':");
    this._outputStream.write(JSON.stringify(eventData, "  "));
    this._outputStream.write("}");
};
