/******************************************************************************
States for the subtap pretty-printer. The states themselves are stateless, instead managing state within the printer. This allows a single instance of each state class to be created at startup and reused for the entire parse.

A state machine may be overkill, but it will be easy to extend to handle unforeseen nuances of the TAP protocol.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var inherits = require('util').inherits;

//// CONSTANTS ////////////////////////////////////////////////////////////////

var MIN_TAP_VERSION = 13;

/******************************************************************************
DefaultState provides default behavior for the various events. 
******************************************************************************/

function DefaultState(printer) {
    this.printer = printer;
}

DefaultState.prototype.assertHandler = function (assert) {
    this._unexpectedEvent('assert');
};

DefaultState.prototype.bailoutHandler = function (reason) {
    this._unexpectedEvent('bailout');
};

DefaultState.prototype.childHandler = function (childParser) {
    this._unexpectedEvent('child');
};

DefaultState.prototype.commentHandler = function (comment) {
    // ignore comments by default
};

DefaultState.prototype.completeHandler = function (results) {
    this._unexpectedEvent('complete');
};

DefaultState.prototype.extraHandler = function (extra) {
    this._unexpectedEvent('extra');
};

DefaultState.prototype.planHandler = function (plan) {
    this._unexpectedEvent('plan');
};

DefaultState.prototype.versionHandler = function (version) {
    this._unexpectedEvent('version');
};

DefaultState.prototype._unexpectedEvent = function (eventName) {
    throw new Error("unexpected '"+ eventName +"' event");
};

/******************************************************************************
InitialState verifies the version of TAP output
******************************************************************************/

function InitialState(printer) {
    DefaultState.call(this, printer);
}
inherits(InitialState, DefaultState);

InitialState.prototype.versionHandler = function (version) {
    if (version < MIN_TAP_VERSION)
        throw new Error("Requires TAP v."+ MIN_TAP_VERSION +" or newer");
    this.printer._counts = {
        rootTests: 0,
        nestedTests: 0,
        assertions: 0,
        failedRootTests: 0,
        failedNestedTests: 0,
        failedAssertions: 0
    };
    this.printer._state = this.printer._stateReceiveTest;
};

InitialState.prototype._unexpectedEvent = function (eventName) {
    throw new Error("Stream must begin with TAP version");
};

/******************************************************************************
AwaitTestNameState expects a comment line naming the next test
******************************************************************************/

function AwaitTestNameState(printer) {
    DefaultState.call(this, printer);
}
inherits(AwaitTestNameState, DefaultState);

AwaitTestNameState.prototype.commentHandler = function (comment) {
    var match = comment.match(/^# (Subtest: (.+))\n$/i);
    if (match === null)
        throw new Error('expected test name, got "'+ comment +'"');
    var nameIndex = (this.printer._testNameStack.length === 0 ? 2 : 1);
    var testName = match[nameIndex];
    this.printer._testNameStack.push(testName);
    this.printer.printTestHeader();
    if (this.printer._testNameStack.length === 1)
        ++this.printer._counts.rootTests;
    else
        ++this.printer._counts.nestedTests;
    this.printer._state = this.printer._stateReceiveTest;
};

/******************************************************************************
ReceiveTestState receives assertions within a test and nested tests.
******************************************************************************/

function ReceiveTestState(printer) {
    DefaultState.call(this, printer);
}
inherits(ReceiveTestState, DefaultState);

ReceiveTestState.prototype.assertHandler = function (assert) {
    ++this.printer._counts.assertions;
    if (assert.ok)
        this.printer.printPassedAssertion(assert);
    else {
        ++this.printer._counts.failedAssertions;
        this.printer.printFailedAssertion(assert);
    }
};

ReceiveTestState.prototype.childHandler = function (childParser) {
    this.printer._state = this.printer._stateAwaitTestName;
};

ReceiveTestState.prototype.completeHandler = function (results) {
    this.printer.printTestClosing(results);
    if (this.printer._testNameStack.length > 0) {
        if (!results.ok) {
            if (this.printer._testNameStack.length === 1)
                ++this.printer._counts.failedRootTests;
            else
                ++this.printer._counts.failedNestedTests;
        }
        this.printer._testNameStack.pop();
        this.printer._state = this.printer._stateAwaitTapResults;
    }
    this.printer._lastTestResults = results;
};

ReceiveTestState.prototype.extraHandler = function (extra) {
    // ignore
};

ReceiveTestState.prototype.planHandler = function (plan) {
    // ignore
};

/******************************************************************************
AwaitTapResultsState expects the tap module's assertion line for the test results. Ignore these results because we're using those of the tap-parser.
******************************************************************************/

function AwaitTapResultsState(printer) {
    DefaultState.call(this, printer);
}
inherits(AwaitTapResultsState, DefaultState);

AwaitTapResultsState.prototype.assertHandler = function (assert) {
    this.printer._state = this.printer._stateReceiveTest;
};

AwaitTapResultsState.prototype._unexpectedEvent = function (eventName) {
    throw new Error("Expecting 'assert' event for test, got '"+ eventName +"'");
};

//// EXPORTS //////////////////////////////////////////////////////////////////

exports.install = function (printer) {
    printer._stateInitial = new InitialState(printer);
    printer._stateAwaitTestName = new AwaitTestNameState(printer);
    printer._stateReceiveTest = new ReceiveTestState(printer);
    printer._stateAwaitTapResults = new AwaitTapResultsState(printer);
    
    printer._state = printer._stateInitial;
};