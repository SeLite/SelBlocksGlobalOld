/* Copyright 2011 Chris Noe
 * Copyright 2011, 2012, 2013, 2014, 2015, 2016 Peter Kehl
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 1.1. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/1.1/.
 */
/**
 * SelBlocks Global = SelBlocks with functions callable across test cases.
 * Based on SelBlocks 2.1.
 * 
 * SelBlocksGlobal change log, as compared to SelBlocks, in chronological order:
 * - made functions (formerly scripts) callable across test cases
 * - made it compatible with Javscript strict mode - "use strict";
 * -- for that I've removed automatic access to stored variables (without using $). That affects mostly 'for' loop and right side of parameter assignments of 'call'. See http://selite.github.io/SelBlocksGlobal.
 * - added some syntax sugar to Selenese: string{..}, xpath{...}, object{..}, eval{..}, array[..]. See http://selite.github.io/EnhancedSelenese.
 * - if/while/for, call, string{}, xpath{...}, object{}, eval{} and array[] now recognise object "window" - just like getEval() did. 
 * -- therefore evalWithExpandedStoredVars, dropToLoop, returnFromFunction, parseArgs are now a part of Selenium.prototype
 * -- other helper functions are now a part of Selenium.prototype, where needed
 * - changed 'xyz instanceof Array' to Array.isArray(xyz); this may be needed to recognise Array instances passed from different global scope
 * - similarly, changed xyz.constructor==String to xyz.constructor && xyz.constructor.name==='String'
 * -----------
 * Notes from SelBlocks
 * 
 * Provides commands for Javascript-like looping and callable functions,
 *   with scoped variables, and JSON/XML driven parameterization.
 *
 * (SelBlocks installs as a Core Extension, not an IDE Extension, because it manipulates the Selenium object)
 * 
 * Concept of operation:
 *  - Selenium.reset() is intercepted to initialize the block structures.
 *  - testCase.nextCommand() is overridden for flow branching.
 *  - TestLoop.resume() is overridden by exitTest, and by try/catch/finally to manage the outcome of errors.
 *  - The static structure of command blocks is stored in blockDefs[] by script line number.
 *    E.g., ifDef has pointers to its corresponding elseIf, else, endIf commands.
 *  - The state of each function-call is pushed/popped on callStack as it begins/ends execution
 *    The state of each block is pushed/popped on the blockStack as it begins/ends execution.
 *    An independent blockStack is associated with each function-call. I.e., stacks stored on a stack.
 *    (Non-block commands do not appear on the blockStack.)
 *
 * Limitations:
 *  - Incompatible with flowControl (and derivatives), because they unilaterally override selenium.reset().
 *    Known to have this issue:
 *      selenium_ide__flow_control
 *      goto_while_for_ide
 *
 * Acknowledgements:
 *  SelBlocks reuses bits & parts of extensions: flowControl, datadriven, and include.
 *
 * Wishlist:
 *  - show line numbers in the IDE
 *  - validation of JSON & XML input files
 *  - highlight a command that is failed-but-caught in blue
 *
 * Changes since 1.5:
 *  - added try/catch/finally, elseIf, and exitTest commands
 *  - block boundaries enforced (jumping in-to and/or out-of the middle of blocks)
 *  - script/endScript is replaced by function/endFunction
 *  - implicit initialization of for loop variable(s)
 *  - improved validation of command expressions
 *
 * NOTE - The only thing special about SelBlocks parameters is that they are activated and deactivated
 *   as script execution flows into and out of blocks, (for/endFor, function/endFunction, etc).
 *   They are implemented as regular Selenium variables, and therefore the progress of an executing
 *   script can be monitored using the Stored Variables Viewer addon.
 **/

"use strict";
// =============== global functions as script helpers ===============
// getEval script helpers

// Find an element via locator independent of any selenium commands
// (findElementOrNull returns the first if there are multiple matches)
function $e(locator) {
  return selblocks.unwrapObject(selenium.browserbot.findElementOrNull(locator));
}

// Return the singular XPath result as a value of the appropriate type
function $x(xpath, contextNode, resultType) {
  var doc = selenium.browserbot.getDocument();
  var node;
  if (resultType) {
    node = selblocks.xp.selectNode(doc, xpath, contextNode, resultType); // mozilla engine only
  }
  else {
    node = selblocks.xp.selectElement(doc, xpath, contextNode);
  }
  return node;
}

// Return the XPath result set as an array of elements
function $X(xpath, contextNode, resultType) {
  var doc = selenium.browserbot.getDocument();
  var nodes;
  if (resultType) {
    nodes = selblocks.xp.selectNodes(doc, xpath, contextNode, resultType); // mozilla engine only
  }
  else {
    nodes = selblocks.xp.selectElements(doc, xpath, contextNode);
  }
  return nodes;
}

var expandStoredVars;
// selbocks name-space
(function($$){

  // =============== Javascript extensions as script helpers ===============
  // EXTENSION REVIEWERS:
  // Global functions are intentional features provided for use by end user's in their Selenium scripts.

  // eg: "dilbert".isOneOf("dilbert","dogbert","mordac") => true
  String.prototype.isOneOf = function isOneOf(valuesObj)
  {
    var values = valuesObj;
    if (!Array.isArray(values)) {
      // copy function arguments into an array
      values = Array.prototype.slice.call(arguments);
    }
    var i;
    for (i = 0; i < this.length; i++) {
      if (values[i]===this) {
        return true;
      }
    }
    return false;
  };

  // eg: "red".mapTo("primary", ["red","green","blue"]) => primary
  String.prototype.mapTo = function mapTo(/* pairs of: string, array */)
  {
    var errMsg = " The map function requires pairs of argument: string, array";
    assert(arguments.length % 2 === 0, errMsg + "; found " + arguments.length);
    var i;
    for (i = 0; i < arguments.length; i += 2) {
      assert((typeof arguments[i].toLowerCase() === "string") && Array.isArray(arguments[i+1]),
        errMsg + "; found " + typeof arguments[i] + ", " + typeof arguments[i+1]);
      if (this.isOneOf(arguments[i+1])) {
        return arguments[i];
      }
    }
    return this;
  };

  // Return a translated version of a string
  // given string args, translate each occurrence of characters in t1 with the corresponding character from t2
  // given array args, if the string occurs in t1, return the corresponding string from t2, else null
  String.prototype.translate = function translate(t1, t2)
  {
    assert(t1.constructor === t2.constructor, "translate() function requires arrays of the same type");
    assert(t1.length === t2.length, "translate() function requires arrays of equal size");
    var i;
    if (t1.constructor && t1.constructor.name==='String' ) {
      var buf = "";
      for (i = 0; i < this.length; i++) {
        var c = this.substr(i,1);
        var t;
        for (t = 0; t < t1.length; t++) {
          if (c === t1.substr(t,1)) {
            c = t2.substr(t,1);
            break;
          }
        }
        buf += c;
      }
      return buf;
    }

    if ( Array.isArray(t1.constructor) ) {
      for (i = 0; i < t1.length; i++) {
        if (t1[i]===this) {
          return t2[i];
        }
      }
    }
    else {
      assert(false, "translate() function requires arguments of type String or Array");
    }
    return null;
  };

  // ----- SelBlocksGlobal:
    /** @param TestCase optional
     *  @return int 0-based index of given test case within the list of test cases
     *  of the test suite
     **/
    var testCaseIdx= function testCaseIdx( givenTestCase ) {
      givenTestCase= givenTestCase || testCase;
      // Must not use assert() here, because that calls notifyFatalHere() which calls idxHere()
      //  which calls globIdx() which calls testCaseIdx()
      if( typeof givenTestCase !=='object' ) {
          var msg= "SelBlocks error: in testCaseIdx(), param givenTestCase is not an object, neither global testCase is.";
          LOG.error( msg );
          throw new Error(msg);
      }
      if( editor.app.testSuite.tests.length===0 ) {
          var msg= "SelBlocks error: in testCaseIdx(), bad editor.app.testSuite.tests.length===0.";
          LOG.error( msg );
          throw new Error(msg);
      }
      for( var caseIndex=editor.app.testSuite.tests.length-1; caseIndex>=0; caseIndex-- ) {
          if( editor.app.testSuite.tests[caseIndex].content===givenTestCase ) {
              break;
          }
      }
      if( caseIndex<0 ) {
          var msg= "SelBlocks error: in testCaseIdx(), givenTestCase was not matched.";
          LOG.error( msg );
          throw new Error(msg);
      }
      return caseIndex;
    };

    var logAndThrow= function logAndThrow(msg) {
          var error= new Error(msg);
          LOG.error( msg+ "\n" +error.stack );
          throw error;    
    };

    /** This serves to generate unique global identifiers for test script commands.
     *  Results of this functions are usually values of symbols[] and other structures.
     *  @param {number} localIndex 0-based index within givenTestCase (or within testCase).
     *  @param {TestCase} [givenTestCase] optional; using (current) testCase by default
    // I'd rather use objects, but Javascript doesn't compare objects field by field
    // - try javascript:a={first: 1}; b={first: 1}; a==b
     @returns {string} global index of the command, in form testCaseIndex/localIndex
    */
    var globIdx= function globIdx( localIndex, givenTestCase) {
      givenTestCase= givenTestCase || testCase;
      // Must not use assert() here, because that calls notifyFatalHere() which calls idxHere() which calls globIdx()
      if( typeof localIndex !=='number' || localIndex<0 ) {
          logAndThrow( "SelBlocks error: in globIdx(), bad type/value of the first parameter localIndex: " +localIndex );
      }
      if( typeof givenTestCase !=='object' ) {
          logAndThrow( "SelBlocks error: in globIdx(), bad type of the optional second parameter givenTestCase (or global testCase)." );
      }
      var caseIndex= testCaseIdx(givenTestCase);
      return '' +caseIndex+ '/' +localIndex;
    };
    
    var shiftGlobIdx= function shiftGlobIdx( relativeShift=0, globalIndex ) {
        SeLiteMisc.ensureType( relativeShift, 'number', 'relativeShift' );
        if( globalIndex===undefined ) {
            return idxHere( relativeShift );
        }
        // @TODO consider expanding code here and making efficient:
        return globIdx( localIdx(globalIndex)+relativeShift, localCase(globalIndex) );
    };
    
    /** @return {number} (not a Number object) 0-based index of the respective command within its test case
     * @param {string} globIdxValue Global index of a test command (test step).
     */
    var localIdx= function localIdx( globIdxValue ) {
      // Can't use assert() here, since assert indirectly calls fmtCmdRef() which calls localIdx() - recursion
      SeLiteMisc.ensureType( globIdxValue, 'string', 'globIdxValue' );
      if( typeof globIdxValue !== 'string' ) {
          SeLiteMisc.fail( 'globIdxValue must be a string, but got ' +(typeof globIdxValue)+ ': ' +globIdxValue );
          LOG.error( msg );
          throw new Error(msg);
      }
      var lastSlashIndex= globIdxValue.lastIndexOf('/');
      if( lastSlashIndex<=0 ) {
          var msg= 'globIdxValue must contain "/" and not as the first character.';
          LOG.error( msg );
          throw new Error(msg);
      }
      if( lastSlashIndex>=globIdxValue.length ) {
          var msg= 'globIdxValue must contain "/" and not as the last character.';
          LOG.error( msg );
          throw new Error(msg);
      }
      var afterSlash= globIdxValue.substr( lastSlashIndex+1 );
      var afterSlashNumber= new Number( afterSlash );
      if( afterSlash !== ''+afterSlashNumber ) {
          var msg= 'The part after "/" must be numeric.';
          LOG.error( msg );
          throw new Error(msg);
      }
      var result= afterSlashNumber.valueOf();
      //"TODO:"
      if( result<0 || result>=editor.app.testSuite.tests[localCaseIdxPart(globIdxValue)].content.commands.length ) {
          var msg= 'In localIdx("' +globIdxValue+ '"), result ' +result+ ' is not a valid command index';
          LOG.error( msg );
          throw new Error(msg);
      }
      return result;
    };
    /**@param string result of globIdx() or of labelIdx()
     * @retu rn {number} (not a Number object) 0-based index of the test case (for the given global index)
     *  within the list of test cases (i.e. editor.app.testSuite.tests)
     */
    var localCaseIdxPart= function localCaseIdxPart( globIdxValue ) {
      assert( typeof globIdxValue ==='string', 'globIdxValue must be a string.' );
      var lastSlashIndex= globIdxValue.lastIndexOf('/');
      assert( lastSlashIndex>0, 'globIdxValue must contain "/" and not as the first character.');
      assert( lastSlashIndex<globIdxValue.length-1, 'globIdxValue must contain "/" and not as the last character.');
      var beforeSlash= globIdxValue.substring( 0, globIdxValue.lastIndexOf('/') );
      var beforeSlashNumber= new Number( beforeSlash );
      assert( ''+beforeSlash===''+beforeSlashNumber, 'The part after "/" must be numeric.');
      var result= beforeSlashNumber.valueOf();
      assert( result>=0 && result<editor.app.testSuite.tests.length, 'result not a valid index into editor.app.testSuite.tests.');
      return result;
    };

    /** global array of _usable_ test cases, set in compileSelBlocks().
     *  It contains test cases in the same order as in editor.app.testSuite.tests[],
     *  but here they are as they come from editor.getTestCase()
     **/
    var testCases= [];

    // @return TestCase test case for the given global index
    var localCase= function localCase( globIdxValue ) {
      var index= localCaseIdxPart(globIdxValue);
      assert( index<testCases.length, 'case index: ' +index+ ' but testCases[] has length ' +testCases.length );
      return testCases[ index ];
      /* Following didn't work:
       return editor.app.testSuite.tests[ localCaseIdxPart(globIdxValue) ].content;
      */
    };
    /** @return {Object} Command structure for given global index
     * */
    var localCommand= function localCommand( globIdxValue ) {
        return localCase( globIdxValue ).commands[ localIdx(globIdxValue) ];
    };
    
    /** This serves to generate and compare keys in symbols[] for label commands
     *  @param string label name
     *  @param TestCase test case where the label is; optional - using testCase by default
     *  @return string global label identifier in form 'test-case-index/label'
     **/
    var labelIdx= function labelIdx( label, givenTestCase ) {
        assert( typeof label ==='string', 'label must be a string.');
        givenTestCase= givenTestCase || testCase;
        return ''+testCaseIdx(givenTestCase)+ '/'+ label;
    };

    // @TODO on insert, validate that function names are unique, i.e. no function overriding
  //=============== Call/Scope Stack handling ===============
    /** @var object symbols {
     *    string equal to function's name => globIdx value
     *    string 'testCaseIndex:label-name' => globIdx value
     * }
     */
  var symbols = {};      // command indexes stored by name: function names
  /** @var {BlockDefs} Static command definitions stored by command index. Global, used for all test cases. */
  var blockDefs = null;  // static command definitions stored by command index
    /** @var {Stack} callStack Command execution stack */
  var callStack = null;  // command execution stack
  
  /** Solely for selenium-executionloop-handleAsTryBlock.js. */
  Selenium.prototype.callStack= function callStackFunc() {
      return callStack;
  };
  
  // the idx of the currently executing command
  // This function existed in SelBlocks. SelBlocksGlobal added param relativeShift and made it return a global, cross-test case index, rather than local (test-case specific) index
  /** @param {number} [relativeShift=0] Relative shift to the current command's position
   *  @return {string} global command index
   * */
  var idxHere= function idxHere( relativeShift ) {
      // Must not use assert() here, because that calls notifyFatalHere() which calls idxHere()
      return globIdx( localIdxHere(relativeShift) );
    };
  /** @param {number} [relativeShift=0] Relative shift to the current command's position
   *  @return {number} Current command's position (within current test case), adjusted by relativeShift. Depending on relativeShift the result may not be a valid position.
   * */
  var localIdxHere= function localIdxHere( relativeShift=0 ) {
    return testCase.debugContext.debugIndex+relativeShift;
  };

  // Command structure definitions, stored by command index
  // SelBlocksGlobal: stored by command global index - i.e. value of idxHere()
    var BlockDefs= function BlockDefs() {
      //@TODO use this.xxx=yyy, and define init() on BlockDefs.prototype. Then NetBeans navigation is easier.
      /** @var {object} Serving as an associative array {globIdx => object of {any attributes, idx, cmdName}}. SelBlocksGlobal changed this from an array to an object. */
      var blkDefs = {};
      // initialize an entry in BlockDefs instance at the given command global index
      /** @param {string} i Global index, a result of globIdx() function
       *  @param {Object} [attrs] Extra details to add, depending on the command:
       *  nature: 'if', 'try', 'loop', 'function'
       *  elseIfIdxs - array, used for 'if'
       *  ifIdx - used for 'else', 'elseIf' and 'endIf'; it's a global index of the matching 'if' step
       *  name - used for 'try', it's 'target' of the step (the 2nd column in Selenium IDE)
       *  tryIdx - used by 'catch', 'finally' and 'endTry', index of the matching 'try'
       *  finallyIdx
       *  beginIdx - used by 'continue', 'break', endWhile, endFor, endForeach, endForJson, endForXml;
       *    it's an index of the start of the current loop
       *  endIdx
       *  funcIdx - used by 'return', 'endfunction', 'endScript'
       *  @TODO check beginIdx and other fields - set after calls to blkDefFor(), blkDefAt()
       *  @return {object} A new entry just added to this collection.
       *  @see variable blkDefs
       **/
      blkDefs.init = function BlockDefsInit(i, attrs={} ) {
        assert( typeof testCase.commands ==='object', 'BlockDefs::init() - testCase.commands is of bad type.');
        // @TODO assert regex numeric/numeric
        assert( typeof i ==='string', 'BlockDefs::init() - param i must be a globIdx() result.');
        // @TODO change to use 'this' instead of 'blkDefs' - it will be clearer.
        blkDefs[i] = attrs;
        blkDefs[i].idx = i;
        // Following line is from original SelBlocks, here just for documentation
        //blkDefs[i].cmdName = testCase.commands[i].command;
        blkDefs[i].cmdName = localCase(i).commands[ localIdx(i) ].command.trimLeft(); // trimLeft() is for commands indented with whitespace (when using SeLite ClipboardAndIndent)
        return blkDefs[i];
      };
      return blkDefs;
    };

  // retrieve the blockDef at the given command idx
  /** @param {string} idx Global index of a test step. */
  var blkDefAt= function blkDefAt(idx) {
    return blockDefs[idx];
  };
  // retrieve the blockDef for the currently executing command
  var blkDefHere= function blkDefHere() {
    return blkDefAt(idxHere());
  };
  // retrieve the blockDef for the given blockDef frame
  var blkDefFor= function blkDefFor(stackFrame) {
    if (!stackFrame) {
      return null;
    }
    return blkDefAt(stackFrame.idx);
  };
  
  // An Array object with stack functionality
  var Stack= function Stack() {
    var stack = [];
    stack.isEmpty = function isEmpty() { return stack.length === 0; };
    stack.top = function top()     { return stack[stack.length-1]; };
    stack.findEnclosing = function findEnclosing(_hasCriteria) { return stack[stack.indexWhere(_hasCriteria)]; };
    stack.indexWhere = function indexWhere(_hasCriteria) { // undefined if not found
      var i;
      for (i = stack.length-1; i >= 0; i--) {
        if (_hasCriteria(stack[i])) {
          return i;
        }
      }
    };
    stack.unwindTo = function unwindTo(_hasCriteria) {
      if (stack.length === 0) {
        return null;
      }
      while (!_hasCriteria(stack.top())) {
        stack.pop();
      }
      return stack.top();
    };
    stack.isHere = function isHere() {
      return (stack.length > 0 && stack.top().idx === idxHere());
    };
    return stack;
  };
  
  // Determine if the given stack frame is one of the given block kinds
  Stack.isTryBlock = function isTryBlock(stackFrame) { return (blkDefFor(stackFrame).nature === "try"); };
  Stack.isLoopBlock = function isLoopBlock(stackFrame) { return (blkDefFor(stackFrame).nature === "loop"); };
  Stack.isFunctionBlock = function isFunctionBlock(stackFrame) { return (blkDefFor(stackFrame).nature === "function"); };
  
  // Flow control - we don't just alter debugIndex on the fly, because the command
  // preceding the destination would falsely get marked as successfully executed.
  // SelBLocksGlobal: This is a global index of the next command - set to a result of globIdx()
  var branchIdx = null;

  // if testCase.nextCommand() ever changes, this will need to be revisited
  // (current as of: selenium-ide-2.9.1)
  // See Selenium's {a6fd85ed-e919-4a43-a5af-8da18bda539f}/chrome/content/testCase.js
  // This is for a head-intercept of TestCaseDebugContext.prototype.nextCommand(), and it adds support for SelBlocksGlobal branches (across test cases).
  // We can't redefine/tail-intercept testCase.debugContext.nextCommand() at the time
  // this SelBlocksGlobal source file is loaded, because testCase is not defined yet. Therefore we do it here
  // on the first run of the enclosing tail intercept of Selenium.prototype.reset() below.
  // And we intercept do it on the prototype, so that it applies to any test cases.
  // Other differences to SelBlocks: no support for onServer; no return value.
  var nextCommand= function nextCommand() {
    if( testCase.callFromAsync ) {
        LOG.warn( 'nextCommand: callFromAsync' );
        assert( !this.started, "When using callFromAsync, the test case must not have started yet." );
        this.started = true;
        assert( branchIdx===null, "branchIdx should be null when invoking Selenese from Javascript, but it's: " +branchIdx );
        // The following means that nextCommand() has a big side-effect of actually running doCall().
        LOG.warn( 'nextCommand() invoking doCall()');
        selenium.doCall( testCase.callFromAsync.functionName, testCase.callFromAsync.seleneseParameters, /*invokedFromJavascript*/true, testCase.callFromAsync.onSuccess, testCase.callFromAsync.onFailure, /*callFromAsync*/true );
        delete testCase['callFromAsync'];
    }
    LOG.debug( 'SelBlocks head-intercept of TestCaseDebugContext.nextCommand()');
    if (!this.started) {
      this.started = true;
        // The following is as from SelBlocks, but -1, because the original nextCommand() increases it (after this head intercept).
      this.debugIndex = testCase.startPoint
           ? testCase.commands.indexOf(testCase.startPoint)-1
           : -1;
    }
    else {
      // SelBlocksGlobal hook for SeLite Bootstrap. @TODO For future: This shouldn't be here, but in testcase-debug-context. However, that would currently be a pain in the neck due to https://github.com/SeleniumHQ/selenium/issues/1537 and https://github.com/SeleniumHQ/selenium/issues/1549 (listed in ThirdPartyIssues.md).
      if( typeof Selenium.reloadScripts==='function' ) { // SeLite Bootstrap is loaded
          LOG.debug('selblocks calling Selenium.reloadScripts()');
          Selenium.reloadScripts();
      }
      if (branchIdx !== null) {
        $$.LOG.info("branch => " + fmtCmdRef(branchIdx));
        // Following uses -1 because the original nextCommand() will increase this.debugIndex by 1 when invoked below
        this.debugIndex = localIdx(branchIdx)-1;

        testCase= this.testCase= localCase(branchIdx);
        testCase.debugContext= this;
        branchIdx = null;
      }
    }
    //SelBlocksGlobal: No need to skip comments. No return value.
  };
  
  /**
   * Creates a pointer to the next command to execute. This pointer is used by
   * nextCommand when considering what to do next.
   * @param {Number} cmdIdx The index of the next command to execute.
   */
  var setNextCommand= function setNextCommand(cmdIdx) {
    var idx= localIdx(cmdIdx);
    var localTestCase= localCase(cmdIdx);
    // When compared to SelBlocks, the following doesn't use cmdIdx+1, because the original nextCommand() will increase this.debugIndex by 1 when invoked below
    assert( idx>=0 && idx< localTestCase.commands.length,
      " Cannot branch to non-existent command @" +cmdIdx );
    branchIdx = cmdIdx;
  };

(function () { // wrapper makes testCaseDebugContextWasIntercepted private
  var testCaseDebugContextWasIntercepted; // undefined or true
  // Selenium calls reset():
  //  * before each single (double-click) command execution
  //  * before a testcase is run
  //  * before each testcase runs in a running testsuite
  // TBD: skip during single command execution

  // SelBlocksGlobal: leaving the original indentation here, to make mergies easier:
  $$.fn.interceptAfter(Selenium.prototype, "reset", function resetInterceptedBySelBlocksGlobal()
  {
    $$.LOG.trace("In tail intercept :: Selenium.reset()");
    // SelBlocksGlobal: no support for onServer
    try {
      compileSelBlocks();
    }
    catch (err) {
      notifyFatalErr("In " + err.fileName + " @" + err.lineNumber + ": " + err);
    }
    callStack = new Stack();
    callStack.push({ blockStack: new Stack() }); // top-level execution state

    $$.tcf = { nestingLevel: -1 }; // try/catch/finally nesting

    if( testCaseDebugContextWasIntercepted===undefined ) {
    // customize flow control logic
    // SelBlocksGlobal: This is a head-intercept, rather than interceptReplace as in SelBlocks 2.0.1. (In SelBlocksGlobal it can't be a tail intercept - contrary to a comment suggestion in SelBlocks.) That's why the injected nextCommand() doesn't increase debugIndex - because the original nextCommand() does it after the injected head intercept.
    // SelBlocksGlobal: intercepting TestCaseDebugContext.prototype.nextCommand() rather than testCase.debugContext.nextCommand() as it was in SelBlocks.
        $$.LOG.debug("Configuring head intercept: TestCaseDebugContext.prototype.nextCommand()");
        $$.fn.interceptBefore(TestCaseDebugContext.prototype, "nextCommand", nextCommand);
        testCaseDebugContextWasIntercepted= true;
    }
  });
    }
) ();

  // get the blockStack for the currently active callStack
  var activeBlockStack= function activeBlockStack() {
    return callStack.top().blockStack;
  };

    // ================================================================================
    // Assemble block relationships and symbol locations
    var compileSelBlocks= function compileSelBlocks()
  {
      symbols= {}; // Let's clear symbols
      // Currently, this is called multiple times when Se IDE runs the whole test suite
      // - once per each test case. No harm in that, only a bit of wasted CPU.

      //alert( 'testCase===editor.suiteTreeView.getCurrentTestCase(): ' +(testCase===editor.suiteTreeView.getCurrentTestCase()) ); // --> false!
      //alert( 'testCase===editor.getTestCase(): ' +(testCase===editor.getTestCase()) ); //--> true!
      var testCaseOriginal= testCase;
      var testCaseOriginal= editor.getTestCase();
      var testCaseOriginalIndex= -1;
      testCases= [];
      //alert( 'editor.app.getTestSuite()===editor.app.testSuite: ' +editor.app.getTestSuite()===editor.app.testSuite ); // => false
      //alert( 'editor.app.testSuite.tests.indexOf( testCase): ' +editor.app.testSuite.tests.indexOf( testCase) ); // => -1
    // SelBlocksGlobal: I set blockDefs before looping through test cases, because it's global - for all test cases
    blockDefs = new BlockDefs();
      for( var testCaseIndex=0; testCaseIndex<editor.app.testSuite.tests.length; testCaseIndex++ ) {
        var iteratedTestCase= editor.app.getTestSuite().tests[testCaseIndex];
        // Following is based on editor.app.setTestCase(), which gets called by editor.app.showTestCaseFromSuite(). I don't call those functions themselves, because setTestCase() triggers testCaseChanged event, which then scrolls up the GUI list of commands, and that is disturbing.
        var content= iteratedTestCase.content;
        if( !content ) {
            content= editor.app._loadTestCase(
                iteratedTestCase.getFile(),
                function(test) {
                        test.title = iteratedTestCase.getTitle(); // load title from suite
                        iteratedTestCase.content = test;
                },
                true
            );
        }
        editor.app.testCase = content;
        
        var curCase= editor.getTestCase();
        if( curCase===testCaseOriginal ) {
            testCaseOriginalIndex= testCaseIndex;
        }
        assert( curCase.debugContext && curCase.debugContext.currentCommand, 'curCase.debugContext.currentCommand not present!' );
        testCases.push( curCase );

        compileSelBlocksTestCase( curCase );
      }
      assert( testCaseOriginalIndex>=0, "testCaseOriginalIndex mut be non-negative!");
      // In the following, do not pass testCases[testCaseOriginalIndex], since
      // it is not the same as editor.app.getTestSuite().tests[testCaseOriginalIndex].
      // See notes above for why the following sets editor.app.testCase directly, rather than through editor.app.showTestCaseFromSuite(). Also, by now the test case's .content has been loaded, so I don't re-check it here:
      editor.app.testCase = editor.app.getTestSuite().tests[testCaseOriginalIndex].content;
      testCase.debugContext.testCase= testCase;
  };
  // end of compileSelBlocks()
  
    // SelBlocksGlobal: Following three functions were inside compileSelBlocksTestCase(), but that doesn't follow JS strict mode. Two of them didn't have to be closures. assertBlockIsPending() used to be a closure, now it received parameter lexStack and is not a closure anymore.
    //- command validation
    var assertNotAndWaitSuffix= function assertNotAndWaitSuffix(cmdIdx) {
      assertCmd(cmdIdx, localCase(cmdIdx).commands[ localIdx(cmdIdx) ].command.indexOf("AndWait") === -1,
        ", AndWait suffix is not valid for SelBlocks commands");
    };
    //- active block validation
    var assertBlockIsPending= function assertBlockIsPending(lexStack, expectedCmd, cmdIdx, desc=", without an beginning [" + expectedCmd + "]" ) {
      assertCmd(cmdIdx, !lexStack.isEmpty(), desc);
    };
    //- command-pairing validation
    var assertMatching= function assertMatching(curCmd, expectedCmd, cmdIdx, pendIdx) {
      assertCmd(cmdIdx, curCmd === expectedCmd, ", does not match command " + fmtCmdRef(pendIdx));
    };
    
  // SelBlocksGlobal factored the following out of SelBlocks' compileSelBlocks(), to make 'testCase' not refer
  // to global testCase
  var compileSelBlocksTestCase= function compileSelBlocksTestCase( testCase ) {
    // SelBlocksGlobal: I set lexStack here, since it's local stack per testCase (and only used during compilation)
    var lexStack = new Stack();
    
    // SelBlocksGlobal: Following loop variable commandIndex was renamed from 'i' in SelBlocks.
    // I set variable 'i' to globIdx() value of commandIndex (i.e. of the original intended value of 'i'). This way
    // the original SelBlocks code still uses variable 'i', so there are less merge conflicts.
    var commandIndex;
    for (commandIndex = 0; commandIndex < testCase.commands.length; commandIndex++)
    {
      if (testCase.commands[commandIndex].type === "command")
      {
        var curCmd = testCase.commands[commandIndex].command.trimLeft(); // trimLeft() is for commands indented with whitespace (when using SeLite ClipboardAndIndent)
        var aw = curCmd.indexOf("AndWait");
        if (aw !== -1) {
          // just ignore the suffix for now, this may or may not be a SelBlocks commands
          curCmd = curCmd.substring(0, aw);
        }
        var cmdTarget = testCase.commands[commandIndex].target;
        var i= globIdx(commandIndex, testCase);

        var ifDef;
        var tryDef;
        var expectedCmd;
        switch(curCmd)
        {
          case "label":
            assertNotAndWaitSuffix(i);
            symbols[ labelIdx(cmdTarget, testCase) ] = i;
            break;
          case "goto": case "gotoIf": case "skipNext":
            assertNotAndWaitSuffix(i);
            break;

          case "if":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "if", elseIfIdxs: [] }));
            break;
          case "elseIf":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending(lexStack, "elseIf", i, ", is not valid outside of an if/endIf block");
            ifDef = lexStack.top();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            var eIdx = blkDefFor(ifDef).elseIdx;
            if (eIdx) {
              notifyFatal(fmtCmdRef(eIdx) + " An else has to come after all elseIfs.");
            }
            blockDefs.init(i, { ifIdx: ifDef.idx });       // elseIf -> if
            blkDefFor(ifDef).elseIfIdxs.push(i);           // if -> elseIf(s)
            break;
          case "else":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending(lexStack, "if", i, ", is not valid outside of an if/endIf block");
            ifDef = lexStack.top();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            if (blkDefFor(ifDef).elseIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one else associated with a given if.");
            }
            blockDefs.init(i, { ifIdx: ifDef.idx });       // else -> if
            blkDefFor(ifDef).elseIdx = i;                  // if -> else
            break;
          case "endIf":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending(lexStack, "if", i);
            ifDef = lexStack.pop();
            assertMatching(ifDef.cmdName, "if", i, ifDef.idx);
            blockDefs.init(i, { ifIdx: ifDef.idx });       // endIf -> if
            blkDefFor(ifDef).endIdx = i;                   // if -> endif
            if (ifDef.elseIdx) {
              blkDefAt(ifDef.elseIdx).endIdx = i;          // else -> endif
            }
            break;

          case "try":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "try", name: cmdTarget }));
            break;
          case "catch":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending(lexStack, "try", i, ", is not valid without a try block");
            tryDef = lexStack.top();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (blkDefFor(tryDef).catchIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one catch-block associated with a given try.");
            }
            var fIdx = blkDefFor(tryDef).finallyIdx;
            if (fIdx) {
              notifyFatal(fmtCmdRef(fIdx) + " A finally-block has to be last in a try section.");
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // catch -> try
            blkDefFor(tryDef).catchIdx = i;                // try -> catch
            break;
          case "finally":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending(lexStack, "try", i);
            tryDef = lexStack.top();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (blkDefFor(tryDef).finallyIdx) {
              notifyFatal(fmtCmdRef(i) + " There can only be one finally-block associated with a given try.");
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // finally -> try
            blkDefFor(tryDef).finallyIdx = i;              // try -> finally
            if (tryDef.catchIdx) {
              blkDefAt(tryDef.catchIdx).finallyIdx = i;    // catch -> finally
            }
            break;
          case "endTry":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending(lexStack, "try", i);
            tryDef = lexStack.pop();
            assertMatching(tryDef.cmdName, "try", i, tryDef.idx);
            if (cmdTarget) {
              assertMatching(tryDef.name, cmdTarget, i, tryDef.idx); // pair-up on try-name
            }
            blockDefs.init(i, { tryIdx: tryDef.idx });     // endTry -> try
            blkDefFor(tryDef).endIdx = i;                  // try -> endTry
            if (tryDef.catchIdx) {
              blkDefAt(tryDef.catchIdx).endIdx = i;        // catch -> endTry
            }
            break;

          case "while":    case "for":    case "foreach":    case "forJson":    case "forXml":
            assertNotAndWaitSuffix(i);
            lexStack.push(blockDefs.init(i, { nature: "loop" }));
            break;
          case "continue": case "break":
            assertNotAndWaitSuffix(i);
            assertCmd(i, lexStack.findEnclosing(Stack.isLoopBlock), ", is not valid outside of a loop");
            blockDefs.init(i, { beginIdx: lexStack.top().idx }); // -> begin
            break;
          case "endWhile": case "endFor": case "endForeach": case "endForJson": case "endForXml":
            assertNotAndWaitSuffix(i);
            expectedCmd = curCmd.substr(3).toLowerCase();
            assertBlockIsPending(lexStack, expectedCmd, i);
            var beginDef = lexStack.pop();
            assertMatching(beginDef.cmdName.toLowerCase(), expectedCmd, i, beginDef.idx);
            blkDefFor(beginDef).endIdx = i;                // begin -> end
            blockDefs.init(i, { beginIdx: beginDef.idx }); // end -> begin
            break;

          case "loadJsonVars": case "loadXmlVars":
            assertNotAndWaitSuffix(i);
            break;

          case "call":
            assertNotAndWaitSuffix(i);
            blockDefs.init(i);
            break;
          case "function":     case "script":
            assertNotAndWaitSuffix(i);
            symbols[cmdTarget] = i;
            lexStack.push(blockDefs.init(i, { nature: "function", name: cmdTarget }));
            break;
          case "return":
            assertNotAndWaitSuffix(i);
            assertBlockIsPending(lexStack, "function", i, ", is not valid outside of a function/endFunction block");
            var funcCmd = lexStack.findEnclosing(Stack.isFunctionBlock);
            blockDefs.init(i, { funcIdx: funcCmd.idx });   // return -> function
            break;
          case "endFunction":  case "endScript":
            assertNotAndWaitSuffix(i);
            expectedCmd = curCmd.substr(3).toLowerCase();
            assertBlockIsPending(lexStack, expectedCmd, i);
            var funcDef = lexStack.pop();
            assertMatching(funcDef.cmdName.toLowerCase(), expectedCmd, i, funcDef.idx);
            if (cmdTarget) {
              assertMatching(funcDef.name, cmdTarget, i, funcDef.idx); // pair-up on function name
            }
            blkDefFor(funcDef).endIdx = i;                 // function -> endFunction
            blockDefs.init(i, { funcIdx: funcDef.idx });   // endFunction -> function
            break;

          case "exitTest":
            assertNotAndWaitSuffix(i);
            break;
          default:
            }
          }
        }
    if (!lexStack.isEmpty()) {
      // unterminated block(s)
      var cmdErrors = [];
      while (!lexStack.isEmpty()) {
        var pend = lexStack.pop();
        cmdErrors.unshift(fmtCmdRef(pend.idx) + " without a terminating "
          + "'end" + pend.cmdName.substr(0, 1).toUpperCase() + pend.cmdName.substr(1) + "'"
        );
      }
      throw new SyntaxError(cmdErrors.join("; "));
    }
  }; // end of compileSelBlocksTestCase()

  // --------------------------------------------------------------------------------

  // prevent jumping in-to and/or out-of loop/function/try blocks
  var assertIntraBlockJumpRestriction= function assertIntraBlockJumpRestriction(fromIdx, toIdx) {
    var fromRange = findBlockRange(fromIdx);
    var toRange   = findBlockRange(toIdx);
    if (fromRange || toRange) {
      var msg = " Attempt to jump";
      if (fromRange) { msg += " out of " + fromRange.desc + fromRange.fmt(); }
      if (toRange)   { msg += " into " + toRange.desc + toRange.fmt(); }
      assert(fromRange && fromRange.equals(toRange), msg 
        + ". You cannot jump into, or out of: loops, functions, or try blocks.");
    }
  };

  // ascertain in which, if any, block that an locusIdx occurs
  var findBlockRange= function findBlockRange(locusIdx) {
    var idx;
    for (idx = locusIdx-1; idx >= 0; idx--) {
      var blk = blkDefAt(idx);
      if (blk) {
        if (locusIdx > blk.endIdx) { // ignore blocks that are inside this same block
          continue;
        }
        switch (blk.nature) {
          case "loop":     return new CmdRange(blk.idx, blk.endIdx, blk.cmdName + " loop");
          case "function": return new CmdRange(blk.idx, blk.endIdx, "function '" + blk.name + "'");
          case "try":      return isolateTcfRange(locusIdx, blk);
        }
      }
    }
    // return as undefined (no enclosing block at all)
  };

  // pin-point in which sub-block, (try, catch or finally), that the idx occurs
  var isolateTcfRange= function isolateTcfRange(idx, tryDef) {
    // assumptions: idx is known to be between try & endTry, and catch always precedes finally
    var RANGES = [
      { ifr: tryDef.finallyIdx, ito: tryDef.endIdx,     desc: "finally", desc2: "end" }
     ,{ ifr: tryDef.catchIdx,   ito: tryDef.finallyIdx, desc: "catch",   desc2: "finally" }
     ,{ ifr: tryDef.catchIdx,   ito: tryDef.endIdx,     desc: "catch",   desc2: "end" }
     ,{ ifr: tryDef.idx,        ito: tryDef.catchIdx,   desc: "try",     desc2: "catch" }
     ,{ ifr: tryDef.idx,        ito: tryDef.finallyIdx, desc: "try",     desc2: "finally" }
     ,{ ifr: tryDef.idx,        ito: tryDef.endIdx,     desc: "try",     desc2: "end" }
    ];
    var i;
    for (i = 0; i < RANGES.length; i++) {
      var rng = RANGES[i];
      if (rng.ifr <= idx && idx < rng.ito) {
        var desc = rng.desc + "-block";
        if (rng.desc !== "try") { desc += " for"; }
        if (tryDef.name)       { desc += " '" + tryDef.name + "'"; }
        return new CmdRange(rng.ifr, rng.ito, desc);
      }
    }
  };

  // represents a range of script lines
  var CmdRange= function CmdRange(topIdx, bottomIdx, desc) {
    this.topIdx = topIdx;
    this.bottomIdx = bottomIdx;
    this.desc = desc;
    this.equals = function equals(cmdRange) {
      return (cmdRange && cmdRange.topIdx === this.topIdx && cmdRange.bottomIdx === this.bottomIdx);
    };
    this.fmt = function fmt() {
      return " @[" + (this.topIdx+1) + "-" + (this.bottomIdx+1) + "]";
    };
  };

  // ==================== SelBlocks Commands (Custom Selenium Actions) ====================

  var iexpr = Object.create($$.InfixExpressionParser);

  // SelBlocks Global doesn't use validateNames()
  // validate declared variable/parameter name (without $ prefix)
  var validateName= function validateName(name, desc) {
    var match = name.match(/^[a-zA-Z]\w*$/);
    if (!match) {
      notifyFatal("Invalid character(s) in " + desc + " name: '" + name + "'");
    }
  };

  Selenium.prototype.doLabel = function doLabel() {
    // noop
  };
    
  // SelBlocksGlobal
  var expandStoredVarsRegex= /\$(\w[a-zA-Z_0-9]*)/g;
  /** @param {string} expression
   *  @return {string} expression, with any $xyz replaced by storedVars.xyz
   * */
  expandStoredVars= function expandStoredVars( expression ) {
      return expression.replace( expandStoredVarsRegex, 'storedVars.$1' );
  };
    
  // Skip the next N commands (default is 1)
  Selenium.prototype.doSkipNext = function doSkipNext(spec)
  {
    assertRunning();
    var n = parseInt(this.evalWithExpandedStoredVars(spec), 10);
    if (isNaN(n)) {
      if (spec.trim() === "") { n = 1; }
      else { notifyFatalHere(" Requires a numeric value"); }
    }
    else if (n < 0) {
      notifyFatalHere(" Requires a number > 1");
    }

    if (n !== 0) { // if n=0, execute the next command as usual
      var destIdx = globIdx(localIdxHere()+n+1);
      assertIntraBlockJumpRestriction(localIdxHere(), localIdxHere()+n+1);
      setNextCommand(destIdx);
    }
  };

  Selenium.prototype.doGoto = function doGoto(label)
  {
    assertRunning();
    var symbolIndex= labelIdx(label);
    assert(symbols[symbolIndex]!==undefined, " Target label '" + label + "' is not found.");
    assertIntraBlockJumpRestriction(localIdxHere(), localIdx(symbols[symbolIndex]));
    setNextCommand(symbols[symbolIndex]);
  };

  Selenium.prototype.doGotoIf = function doGotoIf(condExpr, label)
  {
    assertRunning();
    if (this.evalWithExpandedStoredVars(condExpr))
      this.doGoto(label);
  };

  // ================================================================================
  Selenium.prototype.doIf = function doIf(condExpr)
  {
    assertRunning();
    var ifDef = blkDefHere();
    var ifState = { idx: idxHere(), elseIfItr: arrayIterator(ifDef.elseIfIdxs) };
    activeBlockStack().push(ifState);
    this.cascadeElseIf(ifState, condExpr);
  };
  Selenium.prototype.doElseIf = function doElseIf(condExpr)
  {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    var ifState = activeBlockStack().top();
    if (ifState.skipElseBlocks) { // if, or previous elseIf, has already been met
      setNextCommand(blkDefAt(blkDefHere().ifIdx).endIdx);
    }
    else {
      this.cascadeElseIf(ifState, condExpr);
    }
  };
  Selenium.prototype.doElse = function doElse()
  {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    var ifState = activeBlockStack().top();
    if (ifState.skipElseBlocks) { // if, or previous elseIf, has already been met
      setNextCommand(blkDefHere().endIdx);
    }
    // else continue into else-block
  };
  Selenium.prototype.doEndIf = function doEndIf() {
    assertRunning();
    assertActiveScope(blkDefHere().ifIdx);
    activeBlockStack().pop();
    // fall out of if-endIf
  };

  Selenium.prototype.cascadeElseIf= function cascadeElseIf(ifState, condExpr) {
    this.assertCompilable("", condExpr, ";", "Invalid condition");
    if (!this.evalWithExpandedStoredVars(condExpr)) {
      // jump to next elseIf or else or endif
      var ifDef = blkDefFor(ifState);
      if (ifState.elseIfItr.hasNext()) { setNextCommand(ifState.elseIfItr.next()); }
      else if (ifDef.elseIdx)          { setNextCommand(ifDef.elseIdx); }
      else                             { setNextCommand(ifDef.endIdx); }
    }
    else {
      ifState.skipElseBlocks = true;
      // continue into if/elseIf block
    }
  };

  // ================================================================================

  // throw the given Error
  Selenium.prototype.doThrow = function doThrow(err) {
    err = this.evalWithExpandedStoredVars(err);
    // @TODO consider using SeLiteMisc.isInstance().
    if (!(err instanceof Error)) {
      err = new SelblocksError(idxHere(), err);
    }
    throw err;
  };

  // TBD: failed locators/timeouts/asserts ?
  Selenium.prototype.doTry = function doTry(tryName)
  {
    assertRunning();
    var tryState = { idx: idxHere(), name: tryName };
    activeBlockStack().push(tryState);
    var tryDef = blkDefHere();

    if (!tryDef.catchIdx && !tryDef.finallyIdx) {
      $$.LOG.warn(fmtCurCmd() + " does not have a catch-block nor a finally-block, and therefore serves no purpose");
      if ($$.tcf.nestingLevel === -1) {
        return; // continue into try-block without any special error handling
      }
    }

    // log an advisory about the active catch block
    if (tryDef.catchIdx) {
      var errDcl = localCommand( tryDef.catchIdx ).target;
      $$.LOG.debug(tryName + " catchable: " + (errDcl || "ANY"));
    }

    $$.tcf.nestingLevel++;
    tryState.execPhase = "trying";

    if ($$.tcf.nestingLevel === 0) {
      // enable special command handling
      var self= this;
      // Original SelBlocks overrode resume() on $$.seleniumTestRunner.currentTest.
      $$.fn.interceptPush(editor, "testLoopResumeHandleFailedResult", $$.testLoopResumeHandleFailedResult );
      
      // Override testLoopResumeHandleFailedResult first and testLoopResumeHandleError second, because the overriden testLoopResumeHandleError() expects the top intercepted function to be itself, so it can call $$.fn.getInterceptTop().attrs.manageError(e).
      $$.fn.interceptPush(editor, "testLoopResumeHandleError",
          $$.testLoopResumeHandleError, {
            manageError: function manageError(err) {
              return self.handleCommandError(err);
            }
          });
    }
    $$.LOG.debug("++ try nesting: " + $$.tcf.nestingLevel);
    // continue into try-block
  };

  Selenium.prototype.doCatch = function doCatch()
  {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    var tryState = activeBlockStack().top();
    if (tryState.execPhase !== "catching") {
      // skip over unused catch-block
      var tryDef = blkDefFor(tryState);
      if (tryDef.finallyIdx) {
        setNextCommand(tryDef.finallyIdx);
      }
      else {
        setNextCommand(tryDef.endIdx);
      }
    }
    $$.LOG.debug("entering catch block");
    // else continue into catch-block
  };
  Selenium.prototype.doFinally = function doFinally() {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    delete storedVars._error;
    $$.LOG.debug("entering finally block");
    // continue into finally-block
  };
  Selenium.prototype.doEndTry = function doEndTry(tryName)
  {
    assertRunning();
    assertActiveScope(blkDefHere().tryIdx);
    delete storedVars._error;
    var tryState = activeBlockStack().pop();
    if (tryState.execPhase) { // ie, it DOES have a catch and/or a finally block
      $$.tcf.nestingLevel--;
      $$.LOG.debug("-- try nesting: " + $$.tcf.nestingLevel);
      if ($$.tcf.nestingLevel < 0) {
        // discontinue try-block handling
        $$.fn.interceptPop(); // Fpr testLoopResumeHandleError
        $$.fn.interceptPop(); // For testLoopResumeHandleFailedResult
        // $$.tcf.bubbling = null;
      }
      if ($$.tcf.bubbling) {
        this.reBubble();
      }
      else {
        $$.LOG.debug("no bubbling in process");
      }
    }
    var tryDef = blkDefFor(tryState);
    $$.LOG.debug("end of try '" + tryDef.name + "'");
    // fall out of endTry
  };

  // --------------------------------------------------------------------------------

  // alter the behavior of Selenium error handling
  //   returns true if error is being managed
  Selenium.prototype.handleCommandError= function handleCommandError(err)
  {
    var tryState = bubbleToTryBlock(Stack.isTryBlock);
    var tryDef = blkDefFor(tryState);
    if( tryState ) {
        $$.LOG.debug("error encountered while: " + tryState.execPhase);
        if (hasUnspentCatch(tryState)) {
          if (this.isMatchingCatch(err, tryDef.catchIdx)) {
            // an expected kind of error has been caught
            $$.LOG.info("@" + (idxHere(+1)) + ", error has been caught" + fmtCatching(tryState));
            tryState.hasCaught = true;
            tryState.execPhase = "catching";
            storedVars._error = err;
            $$.tcf.bubbling = null;
            setNextCommand(tryDef.catchIdx);
            return true;
          }
        }
        if( tryState.callFromAsync ) {
            LOG.debug( 'handleCommandError(): callFromAsync' );
            $$.tcf.bubbling = null;
            return !tryState.callFromAsync;
        }
    }
    // error not caught .. instigate bubbling
    $$.LOG.debug("error not caught, bubbling error: '" + err.message + "'");
    $$.tcf.bubbling = { mode: "error", error: err, srcIdx: idxHere() };
    if (tryState && hasUnspentFinally(tryState)) {
      $$.LOG.info("Bubbling suspended while finally block runs");
      tryState.execPhase = "finallying";
      tryState.hasFinaled = true;
      setNextCommand(tryDef.finallyIdx);
      return true;
    }
    if ($$.tcf.nestingLevel > 0) {
      $$.LOG.info("No further handling, error bubbling will continue outside of this try.");
      setNextCommand(tryDef.endIdx);
      return true;
    }
    $$.LOG.info("No handling provided in this try section for this error: '" + err.message + "'");
    return false; // stop test
  };

  // execute any enclosing finally block(s) until reaching the given type of enclosing block
  Selenium.prototype.bubbleCommand= function bubbleCommand(cmdIdx, _isContextBlockType)
  {
    var self= this;
    //- determine if catch matches an error, or there is a finally, or the ceiling block has been reached
    var isTryWithMatchingOrFinally= function isTryWithMatchingOrFinally(stackFrame) {
      if (_isContextBlockType && _isContextBlockType(stackFrame)) {
        return;
      }
      if ($$.tcf.bubbling && $$.tcf.bubbling.mode === "error" && hasUnspentCatch(stackFrame)) {
        var tryDef = blkDefFor(stackFrame);
        if (self.isMatchingCatch($$.tcf.bubbling.error, tryDef.catchIdx)) {
          return;
        }
      }
      return hasUnspentFinally(stackFrame);
    };
    
    var tryState = bubbleToTryBlock(isTryWithMatchingOrFinally);
    var tryDef = blkDefFor(tryState);
    $$.tcf.bubbling = { mode: "command", srcIdx: cmdIdx, _isStopCriteria: _isContextBlockType };
    if (hasUnspentFinally(tryState)) {
      $$.LOG.info("Command " + fmtCmdRef(cmdIdx) + ", suspended while finally block runs");
      tryState.execPhase = "finallying";
      tryState.hasFinaled = true;
      setNextCommand(tryDef.finallyIdx);
      // begin finally block
    }
    else {
      $$.LOG.info("No further handling, bubbling continuing outside of this try.");
      setNextCommand(tryDef.endIdx);
      // jump out of try section
    }
  };

  //- error message matcher
  Selenium.prototype.isMatchingCatch= function isMatchingCatch(e, catchIdx) {
    var errDcl = localCommand( catchIdx ).target;
    if (!errDcl) {
      return true; // no error specified means catch all errors
    }
    var errExpr = this.evalWithExpandedStoredVars(errDcl);
    var errMsg = e.message;
    if (errExpr.constructor && errExpr.constructor.name==='RegExp') {
      return (errMsg.match(errExpr));
    }
    return (errMsg.indexOf(errExpr) !== -1);
  };
  
  // SelBlocksGlobal:
  var restoreCallFrame= function restoreCallFrame( callFrame ) {
      var _result= storedVars._result;
      storedVars= callFrame.savedVars;
      storedVars._result= _result;
      testCase= callFrame.testCase;
      testCase.debugContext.testCase= testCase;
      testCase.debugContext.debugIndex = localIdx( callFrame.returnIdx );
      restoreVarState(callFrame.savedVars);
  };
  
  // unwind the blockStack, and callStack (ie, aborting functions), until reaching the given criteria
 /** @return {null|false} if there is no appropriate try block. */
  var bubbleToTryBlock= function bubbleToTryBlock(_hasCriteria) {
    if ($$.tcf.nestingLevel < 0) {
      $$.LOG.warn("bubbleToTryBlock() called outside of any try nesting");
    }
    var callFrame = callStack.top();
    var tryState = unwindToBlock(_hasCriteria);
    if( !tryState && callFrame.callFromAsync ) {
        LOG.debug('bubbleToTryBlock(): callFromAsync. Popping callStack');
        
        callStack.pop();
        // @TODO simplify dependant code - because now, in the following callFromAsync is always true
        return {invokedFromJavascript: true, callFromAsync: callFrame.callFromAsync};
    }
    while (!tryState && $$.tcf.nestingLevel > -1 && callStack.length > 1) {
      LOG.warn( 'bubbleToTryBlock: popping callStack from within while() loop.');
      callFrame = callStack.pop();
      restoreCallFrame( callFrame );
      $$.LOG.info("function '" + callFrame.name + "' aborting due to error");
      tryState = unwindToBlock(_hasCriteria);
      if( !tryState && callFrame.callFromAsync ) {
          LOG.warn('bubbleToTryBlock: deeper level invokedFromJavascript. popping callStack');
          callStack.pop();
          return {invokedFromJavascript: true, callFromAsync: callFrame.callFromAsync};
      }
    }
    return tryState;
  };

  // unwind the blockStack until reaching the given criteria
  var unwindToBlock= function unwindToBlock(_hasCriteria) {
    var tryState = activeBlockStack().unwindTo(_hasCriteria);
    if (tryState) {
      $$.LOG.debug("unwound to: " + fmtTry(tryState));
    }
    return tryState;
  };

  // resume or conclude command/error bubbling
  Selenium.prototype.reBubble= function reBubble() {
    if ($$.tcf.bubbling.mode === "error") {
      if ($$.tcf.nestingLevel > -1) {
        $$.LOG.debug("error-bubbling continuing...");
        this.handleCommandError($$.tcf.bubbling.error);
      }
      else {
        $$.LOG.error("Error was not caught: '" + $$.tcf.bubbling.error.message + "'");
        try { throw $$.tcf.bubbling.error; }
        finally { $$.tcf.bubbling = null; }
      }
    }
    else { // mode === "command"
      if (isBubblable()) {
        $$.LOG.debug("command-bubbling continuing...");
        this.bubbleCommand($$.tcf.bubbling.srcIdx, $$.tcf.bubbling._isStopCriteria);
      }
      else {
        $$.LOG.info("command-bubbling complete - suspended command executing now " + fmtCmdRef($$.tcf.bubbling.srcIdx));
        setNextCommand($$.tcf.bubbling.srcIdx);
        $$.tcf.bubbling = null;
      }
    }
  };

  // instigate or transform bubbling, as appropriate
  Selenium.prototype.transitionBubbling= function transitionBubbling(_isContextBlockType)
  {
    if ($$.tcf.bubbling) { // transform bubbling
      if ($$.tcf.bubbling.mode === "error") {
        $$.LOG.debug("Bubbling error: '" + $$.tcf.bubbling.error.message + "'"
          + ", replaced with command " + fmtCmdRef(idxHere()));
        $$.tcf.bubbling = { mode: "command", srcIdx: idxHere(), _isStopCriteria: _isContextBlockType };
        return true;
      }
      // mode === "command"
      $$.LOG.debug("Command suspension " + fmtCmdRef($$.tcf.bubbling.srcIdx)
        + ", replaced with " + fmtCmdRef(idxHere()));
      $$.tcf.bubbling.srcIdx = idxHere();
      return true;
    }
    if (isBubblable(_isContextBlockType)) { // instigate bubbling
      this.bubbleCommand(idxHere(), _isContextBlockType);
      return true;
    }
    // no change to bubbling
    return false;
  };

  // determine if bubbling is possible from this point outward
  var isBubblable= function isBubblable(_isContextBlockType) {
    var canBubble = ($$.tcf.nestingLevel > -1);
    if (canBubble) {
      var blkState = activeBlockStack().findEnclosing(
        //- determine if stackFrame is a try-block or the given type of block
        function isTryOrContextBlockType(stackFrame) {
          if (_isContextBlockType && _isContextBlockType(stackFrame)) {
            return true;
          }
          return Stack.isTryBlock(stackFrame);
        }
      );
      return (blkDefFor(blkState).nature === "try");
    }
    return canBubble;
  };

  var hasUnspentCatch= function hasUnspentCatch(tryState) {
    return (tryState && blkDefFor(tryState) && blkDefFor(tryState).catchIdx && !tryState.hasCaught);
  };
  var hasUnspentFinally= function hasUnspentFinally(tryState) {
    return (tryState && blkDefFor(tryState) && blkDefFor(tryState).finallyIdx && !tryState.hasFinaled);
  };

  var fmtTry= function fmtTry(tryState)
  {
    var tryDef = blkDefFor(tryState);
    return (
      (tryDef.name ? "try '" + tryDef.name + "' " : "")
      + "@" + (tryState.idx+1)
      + ", " + tryState.execPhase + ".."
      + " " + $$.tcf.nestingLevel + "n"
    );
  };

  var fmtCatching= function fmtCatching(tryState)
  {
    if (!tryState) {
      return "";
    }
    var bbl = "";
    if ($$.tcf.bubbling) {
      bbl = "@" + ($$.tcf.bubbling.srcIdx+1) + " ";
    }
    var tryDef = blkDefFor(tryState);
    var catchDcl = localCommand( tryDef.catchIdx ).target;
    return " :: " + bbl + catchDcl;
  };
  
  // ================================================================================
  Selenium.prototype.doWhile = function doWhile(condExpr)
  {
    var self= this;
    enterLoop(
      function doWhileValidate() {    // validate
          assert(condExpr, " 'while' requires a condition expression.");
          self.assertCompilable("", condExpr, ";", "Invalid condition");
          return null;
      }
      ,function doWhileInitialize() { } // initialize
      ,function doWhileContinueCheck() { return (self.evalWithExpandedStoredVars(condExpr)); } // continue?
      ,function doWhileIterate() { } // iterate
    );
  };
  Selenium.prototype.doEndWhile = function doEndWhile() {
    iterateLoop();
  };

  // ================================================================================
  Selenium.prototype.doFor = function doFor(forSpec)
  {
    var self= this;
    enterLoop(
      function doForValidate(loop) { // validate
          assert(forSpec, " 'for' requires: <initial-val>; <condition>; <iter-stmt>.");
          self.assertCompilable("for ( ", forSpec, " );", "Invalid loop parameters");
          var specs = iexpr.splitList(forSpec, ";");
          assert(specs.length === 3, " 'for' requires <init-stmt>; <condition>; <iter-stmt>.");
          loop.initStmt = specs[0];
          loop.condExpr = specs[1];
          loop.iterStmt = specs[2];
          var localVarNames = parseVarNames(loop.initStmt);
          $$.LOG.debug("localVarNames: " + localVarNames.join(','));
          for( var i=0; i<localVarNames.length; i++ ) { //@TODO  for(.. of..) loop once NetBeans support it.
              var variableName= localVarNames[i];
              variableName.length>1 && variableName[0]==='$' || notifyFatal( 'For loop ' +(i+1)+ 'th variable name must start with $ and have at least one character right of $.' );
              validateName( variableName.substring(1), 'For loop ' +(i+1)+ 'th variable name' );
          }
          return localVarNames;
      }
      ,function doForInitialize(loop) { self.evalWithExpandedStoredVars(loop.initStmt); }          // initialize
      ,function doForContinueCheck(loop) { return self.evalWithExpandedStoredVars(loop.condExpr); } // continue?
      ,function doForIterate(loop) { self.evalWithExpandedStoredVars(loop.iterStmt); }          // iterate
    );
  };
  Selenium.prototype.doEndFor = function endFor() {
    iterateLoop();
  };

  var parseVarNames= function parseVarNames(initStmt) {
    var varNames = [];
    if (initStmt) {
      var vInits = iexpr.splitList(initStmt, ",");
      var i;
      for (i = 0; i < vInits.length; i++) {
        var vInit = iexpr.splitList(vInits[i], "=");
        varNames.push(vInit[0]);
      }
    }
    return varNames;
  };
  
  // ================================================================================
  Selenium.prototype.doForeach = function doForeach(varName, valueExpr)
  {
    var self= this;
    enterLoop(
      function doForeachValidate(loop) { // validate
          assert(varName, " 'foreach' requires a variable name.");
          assert(valueExpr, " 'foreach' requires comma-separated values.");
          self.assertCompilable("[ ", valueExpr, " ];", "Invalid value list");
          loop.values = self.evalWithExpandedStoredVars("[" + valueExpr + "]");
          if (loop.values.length === 1 && Array.isArray(loop.values[0])) {
            loop.values = loop.values[0]; // if sole element is an array, than use it
          }
          return [varName, "_i"];
      }
      ,function doForeachInitialize(loop) { loop.i = 0; storedVars[varName] = loop.values[loop.i]; }       // initialize
      ,function doForeachContinue(loop) { storedVars._i = loop.i; return (loop.i < loop.values.length);} // continue?
      ,function doForeachIterate(loop) { // iterate
          if (++(loop.i) < loop.values.length) {
            storedVars[varName] = loop.values[loop.i];
          }
      }
    );
  };
  Selenium.prototype.doEndForeach = function doEndForeach() {
    iterateLoop();
  };
  // ================================================================================
  Selenium.prototype.doLoadJsonVars = function doLoadJsonVars(filepath, selector)
  {
    assert(filepath, " Requires a JSON file path or URL.");
    var jsonReader = new JSONReader(filepath);
    this.loadVars(jsonReader, "JSON object", filepath, selector);
  };
  Selenium.prototype.doLoadXmlVars = function doLoadXmlVars(filepath, selector)
  {
    assert(filepath, " Requires an XML file path or URL.");
    var xmlReader = new XmlReader(filepath);
    this.loadVars(xmlReader, "XML element", filepath, selector);
  };
  Selenium.prototype.doLoadVars = function doLoadVars(filepath, selector)
  {
    $$.LOG.warn("The loadVars command has been deprecated as of SelBlocks 2.0.2 and will be removed in future releases."
      + " Please use loadXmlVars instead.");
    Selenium.prototype.doLoadXmlVars(filepath, selector);
  };

  Selenium.prototype.loadVars= function loadVars(reader, desc, filepath, selector)
  {
    if (selector) {
      this.assertCompilable("", selector, ";", "Invalid selector condition");
    }
    reader.load(filepath);
    reader.next(); // read first varset and set values on storedVars
    if (!selector && !reader.EOF()) {
      notifyFatalHere(" Multiple " + desc + "s are not valid for this command."
        + ' (A specific ' + desc + ' can be selected by specifying: name="value".)');
    }

    var result = this.evalWithExpandedStoredVars(selector);
    if (typeof result !== "boolean") {
      notifyFatalHere(", " + selector + " is not a boolean expression");
    }

    // read until specified set found
    var isEof = reader.EOF();
    while (!isEof && this.evalWithExpandedStoredVars(selector) !== true) {
      reader.next(); // read next varset and set values on storedVars
      isEof = reader.EOF();
    } 

    if (!this.evalWithExpandedStoredVars(selector)) {
      notifyFatalHere(desc + " not found for selector expression: " + selector
        + "; in input file " + filepath);
    }
  };


  // ================================================================================
  Selenium.prototype.doForJson = function doForJson(jsonpath)
  {
    enterLoop(
      function doForJsonValidate(loop) {  // validate
          assert(jsonpath, " Requires a JSON file path or URL.");
          loop.jsonReader = new $$.fn.JSONReader();
          var localVarNames = loop.jsonReader.load(jsonpath);
          return localVarNames;
      }
      ,function doForJsonInitialize() { }   // initialize
      ,function doForJsonContinue(loop) { // continue?
          var isEof = loop.jsonReader.EOF();
          if (!isEof) { loop.jsonReader.next(); }
          return !isEof;
      }
      ,function doForJsonIterate() { }
    );
  };
  Selenium.prototype.doEndForJson = function doEndForJson() {
    iterateLoop();
  };

  Selenium.prototype.doForXml = function doForXml(xmlpath)
  {
    enterLoop(
      function doForXmlValidate(loop) {  // validate
          assert(xmlpath, " 'forXml' requires an XML file path or URL.");
          loop.xmlReader = new $$.fn.XmlReader();
          var localVarNames = loop.xmlReader.load(xmlpath);
          return localVarNames;
      }
      ,function doForXmlInitialize() { }   // initialize
      ,function doForXmlContinue(loop) { // continue?
          var isEof = loop.xmlReader.EOF();
          if (!isEof) { loop.xmlReader.next(); }
          return !isEof;
      }
      ,function doForXmlIterate() { }
    );
  };
  Selenium.prototype.doEndForXml = function doEndForXml() {
    iterateLoop();
  };



  // --------------------------------------------------------------------------------
  // Note: Selenium variable expansion occurs before command processing, therefore we re-execute
  // commands that *may* contain ${} variables. Bottom line, we can't just keep a copy
  // of parameters and then iterate back to the first command inside the body of a loop.

  var enterLoop= function enterLoop(_validateFunc, _initFunc, _condFunc, _iterFunc)
  {
    assertRunning();
    var loopState;
    if (!activeBlockStack().isHere()) {
      // loop begins
      loopState = { idx: idxHere() };
      activeBlockStack().push(loopState);
      var localVars = _validateFunc(loopState);
      loopState.savedVars = getVarState(localVars);
      initVarState(localVars); // because with-scope can reference storedVars only once they exist
      _initFunc(loopState);
    }
    else {
      // iteration
      loopState = activeBlockStack().top();
      _iterFunc(loopState);
    }

    if (!_condFunc(loopState)) {
      loopState.isComplete = true;
      // jump to bottom of loop for exit
      setNextCommand(blkDefHere().endIdx);
    }
    // else continue into body of loop
  };
  var iterateLoop= function iterateLoop()
  {
    assertRunning();
    assertActiveScope(blkDefHere().beginIdx);
    var loopState = activeBlockStack().top();
    if (loopState.isComplete) {
      restoreVarState(loopState.savedVars);
      activeBlockStack().pop();
      // done, fall out of loop
    }
    else {
      // jump back to top of loop
      setNextCommand(blkDefHere().beginIdx);
    }
  };

  // ================================================================================
  Selenium.prototype.doContinue = function doContinue(condExpr) {
    var loopState = this.dropToLoop(condExpr);
    if (loopState) {
      // jump back to top of loop for next iteration, if any
      var endCmd = blkDefFor(loopState);
      setNextCommand(blkDefAt(endCmd.endIdx).beginIdx);
    }
  };
  Selenium.prototype.doBreak = function doBreak(condExpr) {
    var loopState = this.dropToLoop(condExpr);
    if (loopState) {
      loopState.isComplete = true;
      // jump to bottom of loop for exit
      setNextCommand(blkDefFor(loopState).endIdx);
    }
  };

  // Unwind the command stack to the inner-most active loop block
  // (unless the optional condition evaluates to false)
  Selenium.prototype.dropToLoop= function dropToLoop(condExpr)
  {
    assertRunning();
    if (condExpr) {
      this.assertCompilable("", condExpr, ";", "Invalid condition");
    }
    if (this.transitionBubbling(Stack.isLoopBlock)) {
      return;
    }
    if (condExpr && !this.evalWithExpandedStoredVars(condExpr)) {
      return;
    }
    var loopState = activeBlockStack().unwindTo(Stack.isLoopBlock);
    return loopState;
  };


  // ================================================================================
  /** Note: See also ThirdPartyIssues.md > https://github.com/SeleniumHQ/selenium/issues/1635
   * Both onSuccess or onFailure will be called on success or failure, respectively. They are invoked asynchronously, *after* returning back to Javascript caller (non-Selenese layer that invoked this Selenese).
   * @param {string} funcName
   * @param {string} argSpec Comma-separated assignments of Selenese parameters. See reference.xml.
   * @param {boolean} [invokedFromJavascript=false] Whether invoked from Javascript (rather than directly from Selenese)
   * @param {function} [onSuccess] Callback function. Only used if invokedFromJavascript==true.
   * @param {function} [onFailure] Callback function. Only used if invokedFromJavascript==true.
   * */
  Selenium.prototype.doCall = function doCall(funcName, argSpec, invokedFromJavascript=false, onSuccess, onFailure, callFromAsync=false )
  {
    var loop = currentTest || htmlTestRunner.currentTest; // See Selenium.prototype.doRollup()
    assertRunning(); // TBD: can we do single execution, ie, run from this point then break on return?
    if (argSpec) {
      this.assertCompilable("var ", argSpec, ";", "Invalid call parameter(s)");
    }
    var funcIdx = symbols[funcName];
    assert(funcIdx!==undefined, " Function does not exist: " + funcName + ".");
    
    var activeCallFrame = callStack.top();
    if (activeCallFrame.isReturning && activeCallFrame.returnIdx === idxHere()) {
      assert( !invokedFromJavascript, "Should have invokedFromJavascript undefined/false." );
      LOG.warn( 'doCall: isReturning: popping call Stack');
      // returning from completed function
      var popped= callStack.pop();
      loop.commandError= popped.originalCommandError;
      var _result= storedVars._result;
      storedVars= popped.savedVars; //restoreVarState( popped.savedVars );
      storedVars._result= _result;
      assert( testCase===popped.testCase, "The popped testCase is different." ); // Not sure why, but this seems to be true.
    }
    else {
        LOG.warn('doCall invokedFromJavascript: ' +invokedFromJavascript+ ', callFromAsync: ' +callFromAsync);
      // Support $stored-variablename, just like string{} and getQs, storeQs...
      argSpec= expandStoredVars(argSpec);
      // save existing variable state and set args as local variables
      var args = this.parseArgs(argSpec);
      var savedVars= storedVars; //var savedVars = getVarStateFor(args);
      storedVars= args; //args= setVars(args);

      var originalCommandError= loop.commandError;
      // There can be several cascading layers of these calls - one per function call level.
      loop.commandError= function doCallCommandError( result ) {
          this.commandError= originalCommandError;
          // See also bubbleToTryBlock(..)
          editor.selDebugger.pause();
          originalCommandError.call( this, result ); // I've already restored this.commandError above *before* calling originalCommandError() here, because: if this was a deeper Selenese function call (i.e. a cascade of call -> function..endFunction) then originalCommandError() will restore any previous version of this.commandError, and I don't want to step on its feet here
      };
      
      LOG.warn( 'doCall: pushing callStack');
      callStack.push( {
          funcIdx,
          name: funcName,
          args,
          returnIdx: !invokedFromJavascript
            ? idxHere()
            : (callFromAsync
                ? undefined
                : shiftGlobIdx(1)
              ),
          savedVars,
          blockStack: new Stack(),
          testCase,
          originalCommandError,
          /* Following are only used when invokedFromJavascript is true.
           * If invokedFromJavascript is true, after we finish/return/throw/bubble from the function body, we don't set next Selenese command, because
           * - if this doCall() was invoked from Javascript (with no Selenese on the call stack, e.g. from GUI via a callback closure method), then we don't set the next command, since we're returning back to Javascript layer.
           * - if this doCall() was invoked from getEval(), then Selenium sets the next command to be the one after that getEval()
           * - do not invoke doCall() from javascript{...} or from EnhancedSyntax <>...<>
           */
          invokedFromJavascript,
          callFromAsync,
          onSuccess,
          onFailure,
          //branchIdx: branchIdx,
          testCase,
          debugIndex: testCase.debugContext.debugIndex
      } );
      // jump to function body
      setNextCommand(funcIdx);
    }
  };
  
  Selenium.prototype.callFromAsync= function callFromAsync( seleneseFunctionName, seleneseParameters='', onSuccess, onFailure ) {
    var funcIdx= symbols[seleneseFunctionName];
    testCase= localCase( funcIdx );
    LOG.warn('callFromAsync()');
    testCase.callFromAsync= {
        functionName: seleneseFunctionName,
        seleneseParameters,
        onSuccess,
        onFailure
    };
    
    // Roughly following effects of Editor.prototype.playCurrentTestCase():
    editor.suiteTreeView.currentTestCase==testCase || editor.suiteTreeView.testCaseChanged( testCase );
    editor.playCurrentTestCase();
  };
  
  Selenium.prototype.doFunction = function doFunction(funcName)
  {
    assertRunning();

    var funcDef = blkDefHere();
    var activeCallFrame = callStack.top();
    if (activeCallFrame.funcIdx === idxHere()) {
      //SelBlocks used to call setVars(activeCallFrame.args); here. But this was already handled in doCall().
    }
    else {
      // no active call, skip around function body
      setNextCommand(funcDef.endIdx);
    }
  };
  Selenium.prototype.doReturn = function doReturn(value) {
    this.returnFromFunction(null, value);
  };
  Selenium.prototype.doEndFunction = function doEndFunction(funcName) {
    this.returnFromFunction(funcName);
  };
  Selenium.prototype.doEndScript = function doEndScript(scrName) {
    this.returnFromFunction(scrName);
  };

  Selenium.prototype.returnFromFunction= function returnFromFunction(funcName, returnVal)
  {
    assertRunning();
    if (this.transitionBubbling(Stack.isFunctionBlock)) {
      return;
    }
    var endDef = blkDefHere();
    var activeCallFrame = callStack.top();
    if (activeCallFrame.funcIdx !== endDef.funcIdx) {
      // no active call, we're just skipping around a function block
    }
    else {
      if (returnVal) {
          storedVars._result= typeof returnVal==='object'
            ? returnVal // Enable returning objects via SeLite EnhancedSelenese notation
            : this.evalWithExpandedStoredVars(returnVal);
      }
      activeCallFrame.isReturning = true;
      
      // jump back to call command
      if( !activeCallFrame.invokedFromJavascript ) { // See a comment in doCall()
        setNextCommand(activeCallFrame.returnIdx);
        // Don't callStack.pop() here - doCall() does it instead (in its second run)
      }
      else {
          LOG.warn('returnFromFunction: invokedFromJavascript; callFromAsync: ' +activeCallFrame.callFromAsync);
          //setNextCommand( activeCallFrame.branchIdx ); This failed when branchIdx wasn't set yet
          // When using invokedFromJavascript, then the flow control doesn't go to a separate invoker 'call' Selenese command,
          // since there wasn't any. Hence we handle the stack here.
          testCase= activeCallFrame.testCase;
          testCase.debugContext.debugIndex= activeCallFrame.debugIndex;
          activeCallFrame.callFromAsync || setNextCommand( activeCallFrame.returnIdx );
          LOG.warn( 'returnFromFunction: pop callStack');
          var previousCallFrame= callStack.pop();
            //previousCallFrame.isReturning= true; //?
          //fails: restoreCallFrame( callStack.top() );
          if( activeCallFrame.callFromAsync ) {
            
            editor.selDebugger.runner.currentTest.commandComplete= () => {}; //@TODO onSuccess??
            $$.fn.interceptOnce(editor.selDebugger.runner.IDETestLoop.prototype, "resume", $$.handleAsExitTest);
        }
      }
    }
  };


  // ================================================================================
  Selenium.prototype.doExitTest = function doExitTest() {
    if (this.transitionBubbling()) {
      return;
    }
    // intercept command processing and simply stop test execution instead of executing the next command
    //Following has same effect as intercepting "resume" on editor.selDebugger.runner.IDETestLoop.prototype. Original SelBlocks overrode it on $$.seleniumTestRunner.currentTest, but that is not available here.
    $$.fn.interceptOnce(editor.selDebugger.runner.currentTest, "resume", $$.handleAsExitTest);
  };


  // ========= storedVars management =========
    // SelBlocksGlobal: This is used instead of SelBlocks' evalWithVars(expr)
    Selenium.prototype.evalWithExpandedStoredVars= function evalWithExpandedStoredVars(expr) {
      try {
        typeof expr==='string' || expr===undefined || SeLiteMisc.fail( 'expr must be a string or undefined' );
        var expanded= expr!==undefined
            ? expandStoredVars(expr)
            : undefined;
        LOG.debug( 'Selenium.prototype.evalWithExpandedStoredVars(): ' +expr+ ' expanded to: ' +expanded );
        var window = this.browserbot.getCurrentWindow();
        // Firefox eval() doesn't return values of some expression strings, including
        // '{field: "value"}' and 'return {field: "value"}'. That's why I assign to local variable 'evalWithExpandedStoredVarsResult' first, and then I return it.
        // I add () parenthesis, so that if the the expr contains multiple expressions separated by comma, then this uses the value of the last expression.
        // EXTENSION REVIEWERS: Use of eval is consistent with the Selenium extension itself.
        // Scripted expressions run in the Selenium window, separate from browser windows.
        // Global functions are intentional features provided for use by end user's in their Selenium scripts.
        var result = eval( "var evalWithExpandedStoredVarsResult= " +expanded+ "; evalWithExpandedStoredVarsResult" );
        LOG.debug( 'result: ' +typeof result+ ': ' +SeLiteMisc.objectToString(result, 2) );
        return result;
      }
      catch (err) {
        notifyFatalErr(" While evaluating Javascript expression: " + expr+ " expanded as " +expanded, err);
      }
    };
    
  // This is not related to parseArgs(str) in chrome/content/selenium-core/test/RemoteRunnerTest.js
  Selenium.prototype.parseArgs= function parseArgs(argSpec) { // comma-sep -> new prop-set
    var args = {};
    /* @TODO check & document whether I need to care about string{} here. Maybe just don't support string{...} for 'call' command - it wouldn't make sense for 'call' anyway. $variableName should work for 'call' without using string{...}. 'call' works with string{..}, but it's not recommended for now.

    @TODO See preprocessParameter() in this file.

    // Split argSpec if it is in format fieldA=valueA,fieldB=..string{...},fieldC=..string{..},..
    // This regex allows parameter values within string{..} to contain commas or assignment =.
    // The values within string{...} can't contain curly brackets { and }.
    // @TODO Also support commas within '' or ""? But for now using string{} is a workaround.

    // This regex is optimistic - assuming that argSpec is well-formed
    var spacedRegex= /=\s*([^q][^,]*|string{{[^}]*)\}?\s*,?/;
    var regex= new RegExp( spacedRegex.source.replace( / /g, '') );

    var parms= argSpec.split( regex );
    // The last item in parms[] is an odd empty string, which I ignore
    for( var i = 0; i < parms.length-1; i+=2 ) {
      var key= parms[i].trim();
      var value = parms[i+1];
      if( value.substr(0, 7)==='string{' ) {
          value= value.substr( 7 );
      }
      if( typeof value !=='string' ) {
          // @TODO Log an error instead of an alert:
          alert( 'param ' +key+ ' has value (to evaluate): ' +value+ ' with constructor ' +value.constructor.name );
          // For some reason, LOG.debug() doesn't work here.
      }
      args[ key ] = this.evalWithExpandedStoredVars( value ); // This would fail, since parseArgs() is not a member of Selenium.prototype
    }
    return args;/**/
    // original from SelBlocks:
    var parms = iexpr.splitList(argSpec, ",");
    // var parms = argSpec.split(","); //before SelBlocks 2
    for (var i = 0; i < parms.length; i++) {
      // var keyValue = parms[i].split("="); //before SelBlocks 2
      var keyValue = iexpr.splitList(parms[i], "=");
      validateName(keyValue[0], "parameter");
      args[ keyValue[0].trim() ] = this.evalWithExpandedStoredVars(keyValue[1]);
    }
    return args;
  };
  var initVarState= function initVarState(names) { // new -> storedVars(names)
    if (names) {
      var i;
      for (i = 0; i < names.length; i++) {
        if (!storedVars[names[i]]) {
          storedVars[names[i]] = null;
        }
      }
    }
  };
  var getVarStateFor= function getVarStateFor(args) { // storedVars(prop-set) -> new prop-set
    var savedVars = {};
    var varname;
    for (varname in args) {
      savedVars[varname] = storedVars[varname];
    }
    return savedVars;
  };
  var getVarState= function getVarState(names) { // storedVars(names) -> new prop-set
    var savedVars = {};
    if (names) {
      var i;
      for (i = 0; i < names.length; i++) {
        savedVars[names[i]] = storedVars[names[i]];
      }
    }
    return savedVars;
  };
  var setVars= function setVars(args) { // prop-set -> storedVars
    var varname;
    for (varname in args) {
      storedVars[varname] = args[varname];
    }
  };
  var restoreVarState= function restoreVarState(savedVars) { // prop-set --> storedVars
    var varname;
    for (varname in savedVars) {
      if (savedVars[varname] === undefined) {
        delete storedVars[varname];
      }
      else {
        storedVars[varname] = savedVars[varname];
      }
    }
  };

  // ========= error handling =========

  var SelblocksError= function SelblocksError(idx, message='') {
    this.name = "SelblocksError";
    this.message = message;
    this.idx = idx;
  };
  SelblocksError.prototype = Error.prototype;

  // TBD: make into throwable Errors
  var notifyFatalErr= function notifyFatalErr(msg, err) {
    $$.LOG.error("Error " + msg);
    $$.LOG.logStackTrace(err);
    throw err;
  };
  var notifyFatal= function notifyFatal(msg) {
    var err = new Error(msg);
    $$.LOG.error("Error " + msg);
    $$.LOG.logStackTrace(err);
    throw err;
  };
  var notifyFatalCmdRef= function notifyFatalCmdRef(idx, msg) { notifyFatal(fmtCmdRef(idx) + msg); };
  var notifyFatalHere= function notifyFatalHere(msg) {
    // This may be called before testCase is set
    var commandRef;
    if( testCase===undefined ) {
      commandRef= 'unknown step: ';
      }
    else {
      // SelBlocks used fmtCurCmd() here. However, this
      // may be called right after TestCaseDebugContext's nextCommand(), which (as intercepted by SelBlocksGlobal) sets testCase.debugContext.debugIndex to -1. Then
      // fmtCurCmd() would fail (as it invokes idxHere() -> globIdx(-1).
      var stepLocalIdx= localIdxHere();
      commandRef= fmtCmdRef( globIdx( Math.max(stepLocalIdx, 0) ) )+ ': ';
    }
    notifyFatal( commandRef+msg );
  };

  var assertCmd= function assertCmd(idx, cond, msg) { if (!cond) { notifyFatalCmdRef(idx, msg); } };
  var assert= function assert(cond, msg)         { if (!cond) { notifyFatalHere(msg); } };
  // TBD: can we at least show result of expressions?
  var assertRunning= function assertRunning() {
    assert(testCase.debugContext.started, " Command is only valid in a running script,"
        + " i.e., cannot be executed via double-click, or via 'Execute this command'.");
  };
  var assertActiveScope= function assertActiveScope(expectedIdx) {
    var activeIdx = activeBlockStack().top().idx;
    assert(activeIdx === expectedIdx, " unexpected command, active command was " + fmtCmdRef(activeIdx));
  };

  Selenium.prototype.assertCompilable= function assertCompilable(left, stmt, right, explanation) {
    try {
      this.evalWithExpandedStoredVars("function selblocksTemp() { " + left + stmt + right + " }");
    }
    catch (e) {
      throw new SyntaxError(fmtCmdRef(idxHere()) + " " + explanation + " '" + stmt +  "': " + e.message);
    }
  };

  var fmtCurCmd= function fmtCurCmd() {
    return fmtCmdRef(idxHere());
  };
  var fmtCmdRef= function fmtCmdRef(idx) {
    var test= localCase(idx);
    var commandIdx= localIdx(idx);
    //@TODO suggest back to selblocks:
    return "@" +test.file.path+ ': ' +(commandIdx+1) + ": [" + $$.fmtCmd( test.commands[commandIdx] )+ "]";
  };

  //================= utils ===============

  // Elapsed time, optional duration provides expiration
  var IntervalTimer= function IntervalTimer(msDuration) {
    this.msStart = +new Date();
    this.getElapsed = function getElapsed() { return (+new Date() - this.msStart); };
    this.hasExpired = function hasExpired() { return (msDuration && this.getElapsed() > msDuration); };
    this.reset = function reset() { this.msStart = +new Date(); };
  };

  // produce an iterator object for the given array
  var arrayIterator= function arrayIterator(arrayObject) {
    return new function arrayIteratorClosure(ary) {
      var cur = 0;
      this.hasNext = function hasNext() { return (cur < ary.length); };
      this.next = function next() { if (this.hasNext()) { return ary[cur++]; } };
    }(arrayObject);
  };

  // ==================== Data Files ====================
  // Adapted from the datadriven plugin
  // http://web.archive.org/web/20120928080130/http://wiki.openqa.org/display/SEL/datadriven

  var XmlReader= function XmlReader()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load XML file and return the list of var names found in the first <VARS> element
    this.load = function load(filepath)
    {
      var fileReader = new FileReader();
      var fileUrl;
      // in order to not break existing tests the IDE will still use urlFor,
      // on the server it just breaks things. Data can be anywhere on the net,
      // accessible through proper CORS headers.
      // SelBlocksGlobal: no support for globalContext.onServer
        fileUrl = urlFor(filepath);
      var xmlHttpReq = fileReader.getDocumentSynchronous(fileUrl);
      $$.LOG.info("Reading from: " + fileUrl);

      var fileObj = xmlHttpReq.responseXML; // XML DOM
      varsets = fileObj.getElementsByTagName("vars"); // HTMLCollection
      if (varsets === null || varsets.length === 0) {
        throw new Error("A <vars> element could not be loaded, or <testdata> was empty.");
      }

      curVars = 0;
      varNames = XmlReader.attrNamesFor(varsets[0]);
      return varNames;
    };

    this.EOF = function EOF() {
      return (curVars === null || curVars >= varsets.length);
    };

    this.next = function next()
    {
      if (this.EOF()) {
        $$.LOG.error("No more <vars> elements to read after element #" + varsetIdx);
        return;
      }
      varsetIdx++;
      $$.LOG.debug(varsetIdx + ") " + XmlReader.serialize(varsets[curVars]));  // log each name & value

      var expected = XmlReader.countAttrs(varsets[0]);
      var found = XmlReader.countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent <testdata> at <vars> element #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each <vars> element must have the same set of attributes."
        );
      }
      XmlReader.setupStoredVars(varsets, varsetIdx, varsets[curVars]);
      curVars++;
    };
  }; // end of XmlReader

  //- retrieve the names of each attribute on the given XML node
  XmlReader.attrNamesFor= function attrNamesFor(node) {
      var attrNames = [];
      var varAttrs = node.attributes; // NamedNodeMap
      var v;
      for (v = 0; v < varAttrs.length; v++) {
        attrNames.push(varAttrs[v].nodeName);
      }
      return attrNames;
  };
  //- determine how many attributes are present on the given node
  XmlReader.countAttrs= function countAttrs(node) {
      return node.attributes.length;
  };
  //- set selenium variables from given XML attributes
  XmlReader.setupStoredVars= function setupStoredVars(varsets, varsetIdx, node) {
      var varAttrs = node.attributes; // NamedNodeMap
      var v;
      for (v = 0; v < varAttrs.length; v++) {
        var attr = varAttrs[v];
        if (null === varsets[0].getAttribute(attr.nodeName)) {
          throw new Error("Inconsistent <testdata> at <vars> element #" + varsetIdx
            + "; found attribute " + attr.nodeName + ", which does not appear in the first <vars> element."
            + " Each <vars> element must have the same set of attributes."
          );
        }
        storedVars[attr.nodeName] = attr.nodeValue;
      }
  };
  //- format the given XML node for display
  XmlReader.serialize= function serialize(node) {
      if (XMLSerializer !== "undefined") {
        return (new XMLSerializer()).serializeToString(node) ;
      }
      if (node.xml) { return node.xml; }
      throw "XMLSerializer is not supported or can't serialize " + node;
  };
  
  var JSONReader= function JSONReader()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load JSON file and return the list of var names found in the first object
    this.load = function load(filepath)
    {
      var fileReader = new FileReader();
      var fileUrl;
      // in order to not break existing tests the IDE will still use urlFor,
      // on the server it just breaks things. Data can be anywhere on the net,
      // accessible through proper CORS headers.
      // SelBlocksGlobal: no support for globalContext.onServer
        fileUrl = urlFor(filepath);
      // Following steps generate a false-positive error 'syntax error varset.json:1'. See http://selite.github.io/ThirdPartyIssues > https://bugzilla.mozilla.org/show_bug.cgi?id=1031985
      var xmlHttpReq = fileReader.getDocumentSynchronous(fileUrl);
      $$.LOG.info("Reading from: " + fileUrl);

      var fileObj = xmlHttpReq.responseText;
      fileObj = fileObj.replace("/\uFFFD/g", "").replace(/\0/g, "");
      $$.LOG.info('evaluating JSON file' );
      $$.LOG.info(fileObj);
      
      try {
           varsets= JSON.parse(fileObj);
      }
      catch(e) {
          // This is for .json files that don't have keys (field names) in quotes - i.e. they have them in apostrophes or unquoted. Extension reviewers: There is no other way around this. The user's intention is to load the file as an array of objects, so we do it.
           varsets= eval( 'var result=' +fileObj+ '; result' );
     }
      
      if (varsets === null || varsets.length === 0) {
        throw new Error("A JSON object could not be loaded, or the file was empty.");
      }
      $$.LOG.info('Has successfully read the JSON file');

      curVars = 0;
      varNames = JSONReader.attrNamesFor(varsets[0]);
      return varNames;
    };

    this.EOF = function EOF() {
      return (curVars === null || curVars >= varsets.length);
    };

    this.next = function next()
    {
      if (this.EOF()) {
        $$.LOG.error("No more JSON objects to read after object #" + varsetIdx);
        return;
      }
      varsetIdx++;
      $$.LOG.debug(varsetIdx + ") " + JSONReader.serialize(varsets[curVars]));  // log each name & value

      var expected = JSONReader.countAttrs(varsets[0]);
      var found = JSONReader.countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent JSON object #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each JSON object must have the same set of attributes."
        );
      }
      JSONReader.setupStoredVars(varsets, varsetIdx, varsets[curVars]);
      curVars++;
    };
  }; // end of JSONReader

  //- retrieve the names of each attribute on the given object
  JSONReader.attrNamesFor= function attrNamesFor(obj) {
      var attrNames = [];
      var attrName;
      for (attrName in obj) {
        attrNames.push(attrName);
      }
      return attrNames;
  };

  //- determine how many attributes are present on the given obj
  JSONReader.countAttrs= function countAttrs(obj) {
      var n = 0;
      var attrName;
      for (attrName in obj) {
        n++;
      }
      return n;
  };

    //- set selenium variables from given JSON attributes
  JSONReader.setupStoredVars= function setupStoredVars(varsets, varsetIdx, obj) {
      var attrName;
      for (attrName in obj) {
        if (null === varsets[0][attrName]) {
          throw new Error("Inconsistent JSON at object #" + varsetIdx
            + "; found attribute " + attrName + ", which does not appear in the first JSON object."
            + " Each JSON object must have the same set of attributes."
          );
        }
        storedVars[attrName] = obj[attrName];
      }
  };

  //- format the given JSON object for display
  JSONReader.serialize= function serialize(obj) {
      var json = uneval(obj);
      return json.substring(1, json.length-1);
  };
    
  var urlFor= function urlFor(filepath) {
    if (filepath.indexOf("http") == 0) {
      return filepath;
    }
    var URL_PFX = "file://";
    if (filepath.substring(0, URL_PFX.length).toLowerCase() !== URL_PFX) {
      var testCasePath = testCase.file.path.replace("\\", "/", "g");
      var i = testCasePath.lastIndexOf("/");
      filepath = URL_PFX + testCasePath.substr(0, i) + "/" + filepath;
    }
    return filepath;
  };


  // ==================== File Reader ====================
  // Adapted from the include4ide plugin

  function FileReader() {}

  FileReader.prototype.prepareUrl = function prepareUrl(url) {
    var absUrl;
    // htmlSuite mode of SRC? TODO is there a better way to decide whether in SRC mode?
    if (window.location.href.indexOf("selenium-server") >= 0) {
      $$.LOG.debug("FileReader() is running in SRC mode");
      // there's no need to absolutify the url, the browser will do that for you
      // when you make the request. The data may reside anywhere on the site, or
      // within the "virtual directory" created by the selenium server proxy.
      // I don't want to limit the ability to parse files that actually exist on
      // the site, like sitemaps or JSON responses to api calls.
      absUrl = url;
    }
    else {
      absUrl = absolutify(url, selenium.browserbot.baseUrl);
    }
    $$.LOG.debug("FileReader() using URL to get file '" + absUrl + "'");
    return absUrl;
  };

  FileReader.prototype.getDocumentSynchronous = function getDocumentSynchronous(url) {
    var absUrl = this.prepareUrl(url);
    var requester = this.newXMLHttpRequest();
    if (!requester) {
      throw new Error("XMLHttp requester object not initialized");
    }
    requester.open("GET", absUrl, false); // synchronous (we don't want selenium to go ahead)
    try {
      //following generates 'syntax error' in Browser Console. See http://selite.github.io/ThirdPartyIssues > https://bugzilla.mozilla.org/show_bug.cgi?id=1031985
      requester.send(null);
    }
    catch(e) {
      throw new Error("Error while fetching URL '" + absUrl + "':: " + e);
    }
    if (requester.status !== 200 && requester.status !== 0) {
      throw new Error("Error while fetching " + absUrl
        + " server response has status = " + requester.status + ", " + requester.statusText );
    }
    return requester;
  };

  FileReader.prototype.newXMLHttpRequest = function newXMLHttpRequest() {
    var requester = 0;
    try {
      // for IE/ActiveX
      if (window.ActiveXObject) {
        try {       requester = new ActiveXObject("Msxml2.XMLHTTP"); }
        catch(ee) { requester = new ActiveXObject("Microsoft.XMLHTTP"); }
      }
      // Native XMLHttp
      else if (window.XMLHttpRequest) {
        requester = new XMLHttpRequest();
      }
    }
    catch(e) {
      throw new Error("Your browser has to support XMLHttpRequest in order to read data files\n" + e);
    }
    return requester;
  };

}(selblocks));

(function() {
    // Assume single-line string only.
    // Following offers 80/20 support for ECMAScript 6 Template Literals (http://es6-features.org/#StringInterpolation), which use `...${javascript expression}...`.
    // It restricts substitution of ${...} in Selenese parameters.  It doesn't substitute those within template literals `...`.
    // Affected documentation: Selenium IDE > Store Commands and Selenium Variables(http://docs.seleniumhq.org/docs/02_selenium_ide.jsp#store-commands-and-selenium-variables)
    // No special support for `...\${..}...`. That is not an ES6 Template Literal (because of the backslash). However, Selenese doesn't substitue that ${...} with any stored value.
    
    // No need for special support for template literals `...` that include any comments /*...*/ that include back apostrophe `. E.g. `hi ${ /*the following back apostrophe should be ignored`*/ 'man'}` wouldn't match. However, that would be OK, since the inner part of ${...} would consist non-word characters, hence original Selenium.prototype.replaceVariables() wouldn't modify it.
    // Split a (deemed) Javascript expression by comments.
    // Skip comments /*...*/ that are outside any string literals
    // Group meanings:  ((a classic '" or template string ` literal or other char.)   (comment /*..*/      )
    // Capturing Groups:123 4             5             6                             7    8
    // Parenthesis lev: 12 3        3    3        3    3        3   34      4     3 2 2    34      4 3     21
    // Challenge: how to get all matches, rather than just the last.
    
    //var commentOrOtherRegex= /^(('([^']|\\')*'|"([^"]|\\")*"|`([^`]|\\`)*`|((?!\/\*)[^'"])+)|(\/\*((?!\*\/).)*\*\/))+$/;
    
    // Group meanings:         (not a comment /*...*/ )(not a classic string literal     )
    // Captured group levels:  
    // Parenthesis levels:     1      23      3 2     11   2        2  11 
    var templateLiteralRegex= /(?!\/\*((?!\*\/).)*\*\/)(?!'([^']|\\')*')(?!"([^""]|\\")*')/;
    
    var originalReplaceVariables= Selenium.prototype.replaceVariables;
    Selenium.prototype.replaceVariables = function replaceVariables(str) {
        var result= '';
        for( var i=0; i<str.length; i++ ) {
            var slice= '';
            
            while( i<str.length && "'`\"".indexOf(str[i])<0 ) { // Support for strings other than string literals/template literals
                slice+= str[i];
                if( str[i]==='/' && i+1<str.length && str[i+1]==='*' ) { // Support for comment /*...*/
                    slice+= str[++i];
                    while( ++i<str.length ) {
                        slice+= str[i];
                        if( str[i]==='*' && i+1<str.length && str[i+1]==='/' ) {
                            slice+= str[++i];
                            break;
                        }
                    }
                }
                i++; // It may become str.length or str.length+1, but that doesn't matter
            }
            result+= originalReplaceVariables.call( null, slice );
            
            slice= '';
            if( i<str.length && "'`\"".indexOf(str[i])>=0 ) { // Support for string literals/template literals
                var delimiter= str[i];
                slice+= delimiter;
                while( ++i<str.length ) {
                    slice+= str[i];
                    if( str[i]==='\\' ) { // append the character after \
                        if( ++i<str.length ) {
                            slice+= str[i];
                        }
                        continue;
                    }
                    if( str[i]===delimiter ) {
                        break;
                    }
                }
                result+= delimiter!=="`"
                    ? originalReplaceVariables.call( null, slice )
                    : slice;
            }
        }
        return result;
    };    
    
    var originalPreprocessParameter= Selenium.prototype.preprocessParameter;
    // For handling =<>...<>
    var enclosedByEqualsSpecialPairs= /^=<>(((?!<>).)*)<>$/g;
    
    // This adds support for javascript expressions enclosed with <>...<>, \<>...<> or @<>...<>
    // as documented at http://selite.github.io/EnhancedSelenese.
    // If the user wants to actually pass a string '<>' to the result, she or he has to work around this (e.g. by generating it in a Javascript expression).
    // The 3rd captured group - the postfix - is guaranteed not to end with # or @  that would be just before the next occurrence of <>...<> (if any)
    // Levels of regex. parenthesis 12  3    3 2 1  12  3    3 2 1  12  3    3          3    32 1
    var enclosedBySpecialPairs= /((?:(?!<>).)*)<>((?:(?!<>).)+)<>((?:(?!<>)[^#@]|[#@](?!<>))*)/g;
    
    // This sets a head intercept of chrome/content/selenium-core/scripts/selenium-api.js. See http://selite.github.io/EnhancedSelenese.
    Selenium.prototype.preprocessParameter = function selBlocksGlobalPreprocessParameter(whole) {
        // javascript{..} doesn't replace ${variableName}.
        // Selenese ${variableName} requires {}, which is good because it separates it from the rest of the target/value,
        // so it's robust yet easy to use.
        // <>...<> replaces $xxx by the symbol/reference to the stored variable, so it is typed and it doesn't need to be quoted for Javascript processing.
        
        /** string{} - evaluate the expression and cast it as a string. Access stored variables using $xyz. If the stored
            variable is an object/array, you can access its fields - i.e. $object-var-name.fieldXYZ or $array-var-name[index].
           string{} transforms the evaluated result into a string. This way we can use it with standard Se actions
           click/select/type, even if the evaluated value is a number.
           That limits the usage of string{}: you normally don't want string{} to yield an object/array. For such cases use object{...} or array[...]. E.g. passing an
             object as the second parameter to 'typeRandom' action (function doTypeRandom).
        */
        LOG.debug('SeLite SelBlocks Global head override of preprocessParameter(): ' +whole );
        var numberOfSpecialPairs= 0;
        for( var i=1; i<whole.length; i++ ) {
            if( whole[i-1]==='<' && whole[i]==='>' ) {
                numberOfSpecialPairs++;
                i++;
            }
        }
        numberOfSpecialPairs%2===0 || SeLiteMisc.fail( "SeLite SelBlocks Global and its http://selite.github.io/EnhancedSelenese doesn't allow Selenese parameters to contain an odd number of character pairs <>. The parameter value was: " +whole );
        // Match <>...<>, \<>...<>, =<>...<> and @<>...<>. Replace $xx parts with respective stored variables. Evaluate. If it was \<>...<>, then escape it as an XPath string. If it was @<>...<>, then make the rest a String object (rather than a string primitive) and store thesult of Javascript in field seLiteExtra on that String object.
        // I don't replace through a callback function - e.g. whole.replace( enclosedBySpecialPairs, function replacer(match, field) {..} ) - because that would always cast the replacement result as string.
        enclosedByEqualsSpecialPairs.lastIndex= 0;
        var match= enclosedByEqualsSpecialPairs.exec(whole);
        if( match ) {
           return this.evalWithExpandedStoredVars( this.replaceVariables(match[1]) ); // evalWithExpandedStoredVars() calls expandStoredVars()
        }
        else {
            enclosedBySpecialPairs.lastIndex=0;
            var hasExtra= false; // Whether there is @<>...<>
            var extra; // The extra value: result of Javascript from @<>...<>
            /** @type {boolean} Whether <code>result</code> contains a result of at least one <>...<> or its variations.
             * */
            var alreadyProcessedDoubledSpecialPairs= false;
            var result= '';
            for(match= enclosedBySpecialPairs.exec(whole); match; match= enclosedBySpecialPairs.exec(whole) ) {
                var prefix= originalPreprocessParameter.call( this, match[1] ); // That calls Selenium.prototype.replaceVariables()
                var postfix= originalPreprocessParameter.call( this, match[3] ); // That calls Selenium.prototype.replaceVariables()
                var value= this.evalWithExpandedStoredVars( this.replaceVariables(match[2]) );
                !prefix.endsWith('=') || SeLiteMisc.fail( "You can only use =<>...<> with no prefix/postfix, but you've passed parameter value " +whole );
                if( prefix.endsWith('@') ) {
                    !hasExtra || SeLiteMisc.fail( "Selenese parameter contains multiple occurrences of @<>...<>, but it should have a maximum one. The parameter value was: " +whole );
                    hasExtra= true;
                    extra= value;
                    value= '';
                    prefix= prefix.substring( 0, prefix.length-1 );
                }
                else {
                    if( prefix.endsWith("\\") ) {
                        value= ( ''+value ).quoteForXPath(); // From Selenium Core
                        prefix= prefix.substring( 0, prefix.length-1 );
                    }
                }
                alreadyProcessedDoubledSpecialPairs= true;
                result+= prefix+value+postfix;
            }
            if( !alreadyProcessedDoubledSpecialPairs ) {
                // There was no <>...<> (neither its alternatives)
                result= originalPreprocessParameter.call( this, whole ); // That calls Selenium.prototype.replaceVariables()
            }
            if( hasExtra ) {
                result= new String(result);
                result.seLiteExtra= extra;
            }
            return result;
        }
    };
    
    var originalGetEval= Selenium.prototype.getEval;
    Selenium.prototype.getEval = function getEval(script) {
        // Parameter script should be a primitive string. If it is an object, it is a result of exactly one expression within <>...<> (with no prefix & postfix) yeilding an object, or a result of @<>...<> (with an optional prefix/postfix) as processed by Selenium.prototype.preprocessParameter() as overriden by SelBlocksGlobal. Such parameters should not be used with getEval.
        if( typeof script==='object' ) {
            var msg= "You must call getEval (and its derivatives such as storeEval) with a primitive (non-object) string in Target parameter.";
            msg+= script.seLiteExtra!==undefined
                ? " Don't use enhanced syntax @<>...<> for Target."
                : " However, you've used enhanced syntax =<>...<> for Target, which resulted in an object of class " +SeLiteMisc.classNameOf(script)+ ". Alternatively, if you'd really like to pass the string value of this object as a parameter to command getEval (or storeEval...), which would then evaluate it as a Javascript expression (again), use <>...<> instead.";
            msg+= " See http://selite.github.io/EnhancedSelenese"
            SeLiteMisc.fail( msg );
        }
        return originalGetEval.call( this, expandStoredVars(script) );
    };
})();