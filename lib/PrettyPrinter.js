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

//// EVENT HANDLERS ///////////////////////////////////////////////////////////

PrettyPrinter.prototype.assertHandler = function (assert) {
    this._blockExceptions(function _assert() {
        this._state.assertHandler(assert);
    }.bind(this));
};

PrettyPrinter.prototype.bailoutHandler = function (reason) {
    this._blockExceptions(function _bailout() {
        this._state.bailoutHandler(reason);
    }.bind(this));
};

PrettyPrinter.prototype.childHandler = function (childParser) {
    this._blockExceptions(function _child() {
        this._setupParser(childParser);
        this._state.childHandler(childParser);
    }.bind(this));
};

PrettyPrinter.prototype.commentHandler = function (comment) {
    this._blockExceptions(function _comment() {
        this._state.commentHandler(comment);
    }.bind(this));
};

PrettyPrinter.prototype.completeHandler = function (results) {
    this._blockExceptions(function _complete() {
        this._state.completeHandler(results);
    }.bind(this));
};

PrettyPrinter.prototype.extraHandler = function (extra) {
    this._blockExceptions(function _extra() {
        this._state.extraHandler(extra);
    }.bind(this));
};

PrettyPrinter.prototype.planHandler = function (plan) {
    this._blockExceptions(function _plan() {
        this._state.planHandler(plan);
    }.bind(this));
};

PrettyPrinter.prototype.versionHandler = function (version) {
    this._blockExceptions(function _version() {
        this._state.versionHandler(version);
    }.bind(this));
};
