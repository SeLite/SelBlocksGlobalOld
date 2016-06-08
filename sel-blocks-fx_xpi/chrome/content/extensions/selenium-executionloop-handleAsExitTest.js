// selbocks name-space
"use strict";

// Following assignments is purely for JSDoc.
/** @namespace */
selblocks= selblocks;

/** This function replaces native Selenium command-handling for the exitScript command.
* (See TestLoop.prototype.resume() in chrome/content/selenium-core/scripts/selenium-executionloop.js.)
* This causes the script to simply halt rather continuing on to the next command.
*/
selblocks.handleAsExitTest = function() {
    try {
      selenium.browserbot.runScheduledPollers();
      this.testComplete();
    }
    catch (e) {
      // seems highly unlikely that there would be an error in this very simple case
      this._handleCommandError(e); // marks command as failed (red), and overall test as failed
      this.testComplete();
    }
    selblocks.LOG.info("TEST HALTED");
};
