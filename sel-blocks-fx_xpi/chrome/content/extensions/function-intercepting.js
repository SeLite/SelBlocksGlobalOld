/* Copyright 2011 Chris Noe
 * Copyright 2015, 2016 Peter Kehl
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 1.1. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/1.1/.
 */
"use strict";

// Following assignments is purely for JSDoc.
/** @namespace selblocks*/
selblocks= selblocks;

  // name-space for function interception
  /** @namespace
  */
  selblocks.fn = {};
  
  //@TODO It looks like functions intercepted by the following can't have any parameters. -Peter Kehl
  /** execute the given function before each call of the specified function
  */
  selblocks.fn.interceptBefore = function interceptBefore(targetObj, targetFnName, _fn) {
    var existing_fn = targetObj[targetFnName];
    targetObj[targetFnName] = function() {
      _fn.call(this);
      return existing_fn.call(this);
    };
  };
  /** execute the given function after each call of the specified function
  */
  selblocks.fn.interceptAfter = function interceptAfter(targetObj, targetFnName, _fnAfter) {
    var existing_fn = targetObj[targetFnName];
    targetObj[targetFnName] = function() {
      existing_fn.call(this);
      _fnAfter.call(this);
    };
  };
  /** replace the specified function with the given function
      @member {function}
  */
  selblocks.fn.interceptReplace = function interceptReplace(targetObj, targetFnName, _fn) {
    targetObj[targetFnName] = function() {
      //var existing_fn = targetObj[targetFnName] = _fn;
      return _fn.call(this);
    };
  };
  
  /** @member {Array} */
  selblocks.fn.interceptStack = [];

  /** replace the specified function, saving the original function on a stack
    @member {function}
  */
  selblocks.fn.interceptPush = function interceptPush(targetObj, targetFnName, _fnTemp, frameAttrs) {
// selblocks.LOG.warn("interceptPush " + (frameAttrs ? frameAttrs : ""));
    var frame = {
       targetObj: targetObj
      ,targetFnName: targetFnName
      ,savedFn: targetObj[targetFnName]
      ,attrs: frameAttrs
    };
    selblocks.fn.interceptStack.push(frame);
    targetObj[targetFnName] = _fnTemp;
  };
  
  /** restore the most recent function replacement
      @member {function}
   */
  selblocks.fn.interceptPop = function interceptPop() {
    var frame = selblocks.fn.interceptStack.pop();
// selblocks.LOG.warn("interceptPop " + (frame.attrs ? frame.attrs : ""));
    frame.targetObj[frame.targetFnName] = frame.savedFn;
  };
  
  /** @member {function} */
  selblocks.fn.getInterceptTop = function getInterceptTop() {
    return selblocks.fn.interceptStack[selblocks.fn.interceptStack.length-1];
  };

  /** replace the specified function, but then restore the original function as soon as it is call
      @member {function}
   */
  selblocks.fn.interceptOnce = function interceptOnce(targetObj, targetFnName, _fn) {
    $$.fn.interceptPush(targetObj, targetFnName, function(){
      $$.fn.interceptPop(); // un-intercept
      var args = Array.prototype.slice.call(arguments);
      _fn.apply(this, args);    });
  };
