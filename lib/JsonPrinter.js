/******************************************************************************
JsonPrinter outputs TAP events as a JSON array of events. Each event is an array of the form [eventName, eventData].
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');

var TapReceiver = require('./TapReceiver');
var callStack = require('./call_stack');

//// PRIVATE CONFIGURATION ////////////////////////////////////////////////////

// _outputStream - stream to which to write output (a node Writable)
// _tabSize - width of JSON tab indentation in spaces, or 0 to output compact
// _runfilePath - path to runfile for truncating call stacks
// _unstackPaths - array of paths to libraries to truncate from call stacks
// _closeOutputStream - whether to call end() on the output stream (defaults to false, which is usual for stdout)

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
 *   - runfilePath: path to runfile for truncating call stacks (defaults to null for no truncation)
 *   - unstackPaths: array of paths to libraries to truncate from call stacks (defaults to [])
 *   - closeOutputStream: whether to call end() on the output stream (defaults to false, which is usual for stdout)
 * @param inputStreamOptions Options for configuring a stream.Writable
 */

function JsonPrinter (outputStream, printerOptions, inputStreamOptions) {
    TapReceiver.call(this, inputStreamOptions);
    this._outputStream = outputStream;
    printerOptions = printerOptions || {};
    this._tabSize = printerOptions.tabSize || 0;
    this._runfilePath = printerOptions.runfilePath || null;
    this._unstackPaths = printerOptions.unstackPaths || [];
    this._closeOutputStream = printerOptions.closeOutputStream || false;

    this._started = false;
    this._testDepth = 0;
}
util.inherits(JsonPrinter, TapReceiver);
module.exports = JsonPrinter;

//// EVENT HANDLERS ///////////////////////////////////////////////////////////

JsonPrinter.prototype.assertHandler = function (assert) {
    callStack.truncateAssertStacks(assert, this._runfilePath,
            this._unstackPaths);
    this._writeEvent('assert', assert);
};

JsonPrinter.prototype.bailoutHandler = function (reason) {
    this._writeEvent('bailout', reason);
};

JsonPrinter.prototype.childHandler = function (childParser) {
    this._setupParser(childParser);
    this._writeEvent('child', "<childParser>");
    ++this._testDepth;
};

JsonPrinter.prototype.commentHandler = function (comment) {
    this._writeEvent('comment', comment);
};

JsonPrinter.prototype.completeHandler = function (results) {
    this._writeEvent('complete', results);
    if (this._testDepth === 0)
        this._endJson();
    else
        --this._testDepth;
};

JsonPrinter.prototype.extraHandler = function (extra) {
    this._writeEvent('extra', extra);
};

JsonPrinter.prototype.planHandler = function (plan) {
    this._writeEvent('plan', plan);
};

JsonPrinter.prototype.versionHandler = function (version) {
    this._writeEvent('version', version);
};

//// RESTRICTED METHODS ///////////////////////////////////////////////////////

JsonPrinter.prototype._endJson = function () {
    this._outputStream.write("\n]\n");
    if (this._closeOutputStream)
        this._outputStream.end();
};

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
