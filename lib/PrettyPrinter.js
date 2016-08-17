/******************************************************************************
PrettyPrinter
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var util = require('util');

var TapReceiver = require('./TapReceiver');
var states = require('./states');

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _testStack - stack of parses of names of currently active tests
// _counts - object having the following properties:
//   rootTests - count of root-level named tests
//   nestedTests - count of tests nested under root-level tests
//   assertions - count of all assertions (excludes test counts)
//   failedRootTests - count of failed root-level named tests
//   failedNestedTests - count of failed tests nested under root-level tests
//   failedAssertions - count of all failed assertions (excludes test counts)
// _state - object that receives evens for current state

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * Construct a PrettyPrinter that reads the provided instance of tap-parser.
 *
 * @param tapParser An instance of the 'tap-parser' module that is receiving the TAP output
 * @param report The instance of BaseReport to send parser events.
 */

function PrettyPrinter (tapParser, report) {
    TapReceiver.call(this, tapParser);
    this._testStack = [];
    states.install(this, report);
}
util.inherits(PrettyPrinter, TapReceiver);
module.exports = PrettyPrinter;

//// EVENT HANDLERS ///////////////////////////////////////////////////////////

PrettyPrinter.prototype.assertHandler = function (assert) {
    this._blockExceptions(function() {
        this._state.assertHandler(assert);
    }.bind(this));
};

PrettyPrinter.prototype.bailoutHandler = function (reason) {
    this._blockExceptions(function() {
        this._state.bailoutHandler(reason);
    }.bind(this));
};

PrettyPrinter.prototype.childHandler = function (childParser) {
    this._blockExceptions(function() {
        this._setupParser(childParser);
        this._state.childHandler(childParser);
    }.bind(this));
};

PrettyPrinter.prototype.commentHandler = function (comment) {
    this._blockExceptions(function() {
        this._state.commentHandler(comment);
    }.bind(this));
};

PrettyPrinter.prototype.completeHandler = function (results) {
    this._blockExceptions(function() {
        this._state.completeHandler(results);
    }.bind(this));
};

PrettyPrinter.prototype.extraHandler = function (extra) {
    this._blockExceptions(function() {
        this._state.extraHandler(extra);
    }.bind(this));
};

PrettyPrinter.prototype.planHandler = function (plan) {
    this._blockExceptions(function() {
        this._state.planHandler(plan);
    }.bind(this));
};

PrettyPrinter.prototype.versionHandler = function (version) {
    this._blockExceptions(function() {
        this._state.versionHandler(version);
    }.bind(this));
};
