/******************************************************************************
PrettyPrinter
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');

var TapReceiver = require('./TapReceiver');
var states = require('./states');

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _subtestStack - stack of parses of names of currently active subtests
// _counts - object having the following properties:
//   rootSubtests - count of root subtests
//   nestedTests - count of non-root subtests
//   assertions - count of all assertions (excludes test counts)
//   failedRootSubtests - count of failed root subtests
//   failedNestedTests - count of failed non-root subtests
//   failedAssertions - count of all failed assertions (excludes test counts)
// _state - object that receives evens for current state

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * Construct a PrettyPrinter
 *
 * @param report The instance of BaseReport to send parser events.
 * @param streamOptions Options for configuring a stream.Writable
 */

function PrettyPrinter (report, streamOptions) {
    TapReceiver.call(this, streamOptions);
    this._subtestStack = [];
    states.install(this, report);
}
util.inherits(PrettyPrinter, TapReceiver);
module.exports = PrettyPrinter;

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

PrettyPrinter.prototype.abort = function () {
    this._state.beginAbort(); // initiate abort before flushing parser
    TapReceiver.prototype.abort.call(this); // this flushes the parser
};

//// EVENT HANDLERS ///////////////////////////////////////////////////////////

PrettyPrinter.prototype.assertHandler = function (assert) {
    this._state.assertHandler(assert);
};

PrettyPrinter.prototype.bailoutHandler = function (reason) {
    this._state.bailoutHandler(reason);
};

PrettyPrinter.prototype.childHandler = function (childParser) {
    this._setupParser(childParser);
    this._state.childHandler(childParser);
};

PrettyPrinter.prototype.commentHandler = function (comment) {
    this._state.commentHandler(comment);
};

PrettyPrinter.prototype.completeHandler = function (results) {
    this._state.completeHandler(results);
};

PrettyPrinter.prototype.extraHandler = function (extra) {
    this._state.extraHandler(extra);
};

PrettyPrinter.prototype.planHandler = function (plan) {
    this._state.planHandler(plan);
};

PrettyPrinter.prototype.versionHandler = function (version) {
    this._state.versionHandler(version);
};
