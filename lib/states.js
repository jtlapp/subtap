/******************************************************************************
States for the subtap pretty-printer. The states themselves are stateless, instead managing state within the pretty-printer. This allows a single instance of each state class to be created at startup and reused for the entire parse.

A state machine may be overkill for supporting node-tap, but it's easily modified to handle unanticipated nuances, and it can later be extended to support the TAP protocol more generally.
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var inherits = require('util').inherits;
var _ = require('lodash');

//// CONSTANTS ////////////////////////////////////////////////////////////////

var MIN_TAP_VERSION = 13;
var TEST_NAME_REGEX =
        new RegExp("^(?:# Subtest: )(.+?)( \\(.+:[0-9]+\\))?$", 'i');

/******************************************************************************
DefaultState provides default behavior for the various events. 
******************************************************************************/

function DefaultState(printer, report) {
    this._printer = printer;
    this._report = report;
}

//// CONTROL METHODS //////////////////////////////////////////////////////////

DefaultState.prototype.beginAbort = function () {
    this._report.beginAbort();
};

//// TAP EVENT HANDLERS ///////////////////////////////////////////////////////

DefaultState.prototype.assertHandler = function (assert) {
    this._unexpectedEvent('assert', assert);
};

DefaultState.prototype.bailoutHandler = function (reason) {
    this._report.bailout(this._printer._subtestStack, reason,
            this._printer._counts);
};

DefaultState.prototype.childHandler = function (childParser) {
    this._unexpectedEvent('child');
};

DefaultState.prototype.commentHandler = function (comment) {
    this._unexpectedEvent('comment', comment);
};

DefaultState.prototype.completeHandler = function (results) {
    this._unexpectedEvent('complete', results);
};

DefaultState.prototype.extraHandler = function (extra) {
    this._unexpectedEvent('extra', extra);
};

DefaultState.prototype.planHandler = function (plan) {
    this._unexpectedEvent('plan', plan);
};

DefaultState.prototype.versionHandler = function (version) {
    this._unexpectedEvent('version', version);
};

DefaultState.prototype._unexpectedEvent = function (eventName, data) {
    throw new Error("unexpected '"+ eventName +"' event"+
            (data ? "; data "+ JSON.stringify(data) : ''));
};

/******************************************************************************
InitialState verifies the version of TAP output
******************************************************************************/

function InitialState(printer, report) {
    DefaultState.call(this, printer, report);
}
inherits(InitialState, DefaultState);

InitialState.prototype.versionHandler = function (version) {
    if (version < MIN_TAP_VERSION)
        throw new Error("Requires TAP v."+ MIN_TAP_VERSION +" or newer");
    this._printer._counts = {
        rootSubtests: 0,
        nestedTests: 0,
        assertions: 0,
        failedRootSubtests: 0,
        failedNestedTests: 0,
        failedAssertions: 0
    };
    this._printer._state = this._printer._stateReceiveTest;
};

DefaultState.prototype.completeHandler = function (results) {
    // ctrl-C can result in a completion before a version event
    if (results.count > 0)
        this._unexpectedEvent('complete', results);
};

InitialState.prototype._unexpectedEvent = function (eventName) {
    throw new Error("Stream must begin with TAP version");
};

/******************************************************************************
AwaitTestNameState expects a comment line naming the next test
******************************************************************************/

function AwaitTestNameState(printer, report) {
    DefaultState.call(this, printer, report);
}
inherits(AwaitTestNameState, DefaultState);

AwaitTestNameState.prototype.commentHandler = function (comment) {
    var matches = _.trim(comment).match(TEST_NAME_REGEX);
    if (matches === null)
        throw new Error('expected test name, got "'+ comment +'"');
    var testInfo = {
        name: matches[1],
        file: matches[2]
    };
    this._printer._subtestStack.push(testInfo);

    if (this._printer._subtestStack.length === 1)
        ++this._printer._counts.rootSubtests;
    else
        ++this._printer._counts.nestedTests;
    this._report.beginTest(this._printer._subtestStack, testInfo);
    this._printer._state = this._printer._stateReceiveTest;
};

/******************************************************************************
ReceiveTestState receives assertions within a test and nested tests.
******************************************************************************/

function ReceiveTestState(printer, report) {
    DefaultState.call(this, printer, report);
}
inherits(ReceiveTestState, DefaultState);

ReceiveTestState.prototype.assertHandler = function (assert) {
    ++this._printer._counts.assertions;
    if (assert.ok)
        this._report.assertionPassed(this._printer._subtestStack, assert);
    else {
        ++this._printer._counts.failedAssertions;
        this._report.assertionFailed(this._printer._subtestStack, assert);
    }
};

ReceiveTestState.prototype.commentHandler = function (comment) {
    this._report.comment(this._printer._subtestStack, comment);
};

ReceiveTestState.prototype.childHandler = function (childParser) {
    this._printer._state = this._printer._stateAwaitTestName;
};

ReceiveTestState.prototype.completeHandler = function (results) {
    if (this._printer._subtestStack.length === 0) {
        this._report.closeReport(this._printer._subtestStack, results,
                this._printer._counts);
    }
    else {
        if (!results.ok) {
            if (this._printer._subtestStack.length === 1)
                ++this._printer._counts.failedRootSubtests;
            else
                ++this._printer._counts.failedNestedTests;
        }
        this._report.closeTest(this._printer._subtestStack, results);
        this._printer._subtestStack.pop();
        this._printer._state = this._printer._stateAwaitTapResults;
    }
};

ReceiveTestState.prototype.extraHandler = function (extra) {
    this._report.extra(this._printer._subtestStack, extra);
};

ReceiveTestState.prototype.planHandler = function (plan) {
    // ignore
};

/******************************************************************************
AwaitTapResultsState expects the tap module's assertion line for the test results. Ignore these results because we're using those of the tap-parser.
******************************************************************************/

function AwaitTapResultsState(printer, report) {
    ReceiveTestState.call(this, printer, report);
}
inherits(AwaitTapResultsState, ReceiveTestState);

AwaitTapResultsState.prototype.assertHandler = function (assert) {
    this._printer._state = this._printer._stateReceiveTest;
};

AwaitTapResultsState.prototype.childHandler = function (childParser) {
    this._unexpectedEvent('child', childParser);
};

//// EXPORTS //////////////////////////////////////////////////////////////////

exports.install = function (printer, report) {
    printer._stateInitial = new InitialState(printer, report);
    printer._stateAwaitTestName = new AwaitTestNameState(printer, report);
    printer._stateReceiveTest = new ReceiveTestState(printer, report);
    printer._stateAwaitTapResults = new AwaitTapResultsState(printer, report);
    
    printer._state = printer._stateInitial;
};
