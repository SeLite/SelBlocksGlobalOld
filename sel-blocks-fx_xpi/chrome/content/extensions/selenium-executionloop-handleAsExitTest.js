// selbocks name-space
(function($$){

  /* This function replaces native Selenium command handling for the exitScript command.
   * This alters command processing such that the script simply halts rather executing the next command.
   */
  $$.handleAsExitTest = function()
  {
    try {
      selenium.browserbot.runScheduledPollers();
      this.testComplete();
    } catch (e) {
      // seems highly unlikely that there would be an error in this very simple case
      this._handleCommandError(e);
      this.testComplete();
    }
    $$.LOG.info("TEST HALTED");
  };

}(selblocks));
