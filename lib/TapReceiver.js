/******************************************************************************
TapReceiver
******************************************************************************/

//// PRIVATE STATE ////////////////////////////////////////////////////////////

// _terminated - whether to stop receiving events due to an internal error

//// CONSTRUCTION /////////////////////////////////////////////////////////////

/**
 * Construct a TapReceiver that receives events from the provided instance of tap-parser.
 *
 * @param tapParser An instance of the 'tap-parser' module that is receiving the TAP output
 */

function TapReceiver(tapParser) {
    this._terminated = false;
    this._setupParser(tapParser);
}
module.exports = TapReceiver;

//// PUBLIC METHODS ///////////////////////////////////////////////////////////

TapReceiver.prototype.abort = function () {
    this._terminated = true;
};

//// RESTRICTED METHODS ///////////////////////////////////////////////////////

TapReceiver.prototype._blockExceptions = function (handler) {
    if (this._terminated)
        return;
    try {
        handler();
    }
    catch (err) {
        this._exitWithError(err);
    }
};

TapReceiver.prototype._exitWithError = function (err) {
    // don't throw the exception up to the parser, because the parser will
    // hand it to tap, and tap sometimes emits it as a failed assertion.
    // this may not be an bug in tap, because tap is supposed to catch and
    // report exceptions that occur while running a test.
    
    this._terminated = true;
    process.stderr.write("\n"+ err.stack +"\n");
    process.exit(1);
};

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
