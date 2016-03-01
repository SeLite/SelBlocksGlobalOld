/* Copyright 2011 Chris Noe
 * Copyright 2015, 2016 Peter Kehl
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 1.1. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/1.1/.
 */
"use strict";

// selbocks name-space
(function($$){
  // Based on a part of $$.handleAsTryBlock from SelBlocks
  $$.testLoopResumeHandleFailedResult= function testLoopResumeHandleFailedResult() {
      // Selenium IDE doesn't stop running on verifications. Therefore verifications shouldn't trigger 'catch' clause. However, we do suppress making the test case marked as failed, and we log at info level only.
      LOG.info( "try..catch..endTry suppressed verification failure from command: " + this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |");
      this.result.failed= false;
      this.result.passed= true;
  };
  
  // Based on a part of $$.handleAsTryBlock from SelBlocks
  $$.testLoopResumeHandleError= function testLoopResumeHandleError( e ) {
      var originalMessage= e.message; // Selenium IDE generates 'false' message for failed assertions, and those then would only match catch | 'false' |. Following makes them catchable by the actual assertion message.
      if( e.message==='false' ) {
          e.message= this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |";
      }
      if( /*isManaged*/$$.fn.getInterceptTop() && $$.fn.getInterceptTop().attrs.manageError(e) ) {
        var message= originalMessage!=='false'
            ? '. The message: ' +originalMessage
            : '';
        LOG.info( 'try..catch..endTry caught an exception or assert failure from command: ' + this.currentCommand.command + " | " + this.currentCommand.target + " | " + this.currentCommand.value + " |" +message );
        this.continueTest();
      }
      else if( selenium.callStack().top().invokedFromJavascript ) {
        debugger;
        LOG.warn( 'testLoopResumeHandleError: invokedFromJavascript, popping callStack');
        !selenium.callStack().top().onFailure || selenium.callStack().top().onFailure( e );
        LOG.warn( 'testLoopResumeHandleError: invokedFromJavascript, after calling onFailure (if any)');
        selenium.callStack().pop();
        //selenium.returnFromFunction(); //NO - or only use a part
        this.continueTest();
      }
      else {
        this._handleCommandError(e); // causes command to be marked in red
        this.testComplete();
      }
  };
  
  // Original SelBlocks had handleAsTryBlock() here, but SelBlocks Global uses testLoopResumeHandleFailedResult() and testLoopResumeHandleError() instead. See editor.testLoopResume() in SeLite TestCase Debug Context.
}(selblocks));
