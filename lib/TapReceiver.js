/******************************************************************************
TapReceiver
******************************************************************************/

//// MODULES //////////////////////////////////////////////////////////////////

var Writable = require('stream').Writable;
var util = require('util');
var TapParser = require('tap-parser');

//// CONFIGURATION ////////////////////////////////////////////////////////////

// _tapParser - tap-parser instance that parses stream input

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _terminated - whether to stop receiving events due to an internal error

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * Construct a TapReceiver
 *
 * @param streamOptions Options for configuring a stream.Writable
 */

function TapReceiver(streamOptions) {
    Writable.call(this, streamOptions);
    this._tapParser = new TapParser();
    this._terminated = false;
    this._setupParser(this._tapParser);
}
util.inherits(TapReceiver, Writable);
module.exports = TapReceiver;

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

TapReceiver.prototype.abort = function () {
    this._terminated = true;
};

TapReceiver.prototype.end = function (chunk, encoding, done) {
    Writable.prototype.end.call(this, chunk, encoding, done);
    this._tapParser.end();
};

//// RESTRICTED METHODS ///////////////////////////////////////////////////////

TapReceiver.prototype._setupParser = function (parser) {
    parser.on('assert', this.assertHandler.bind(this));
    parser.on('bailout', this.bailoutHandler.bind(this));
    parser.on('child', this.childHandler.bind(this));
    parser.on('comment', this.commentHandler.bind(this));
    parser.on('complete', this.completeHandler.bind(this));
    parser.on('extra', this.extraHandler.bind(this));
    parser.on('plan', this.planHandler.bind(this));
    parser.on('version', this.versionHandler.bind(this));
};

TapReceiver.prototype._write = function (chunk, encoding, done) {
    this._tapParser.write(chunk.toString());
    done();
};
