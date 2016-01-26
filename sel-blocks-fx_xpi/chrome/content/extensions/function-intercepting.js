/* Copyright 2011 Chris Noe
 * Copyright 2015, 2016 Peter Kehl
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 1.1. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/1.1/.
 */
"use strict";

// selbocks name-space
(function($$){

  /* Function interception
  */
  $$.fn = {};
  //@TODO It looks like functions intercepted by the following can't have any parameters. -Peter Kehl
  // execute the given function before each call of the specified function
  $$.fn.interceptBefore = function(targetObj, targetFnName, _fn) {
    var existing_fn = targetObj[targetFnName];
    targetObj[targetFnName] = function() {
      _fn.call(this);
      return existing_fn.call(this);
    };
  };
  // execute the given function after each call of the specified function
  $$.fn.interceptAfter = function(targetObj, targetFnName, _fnAfter) {
    var existing_fn = targetObj[targetFnName];
    targetObj[targetFnName] = function() {
      existing_fn.call(this);
      _fnAfter.call(this);
    };
  };
  // replace the specified function with the given function
  $$.fn.interceptReplace = function(targetObj, targetFnName, _fn) {
    targetObj[targetFnName] = function() {
      //var existing_fn = targetObj[targetFnName] = _fn;
      return _fn.call(this);
    };
  };

  $$.fn.interceptStack = [];

  // replace the specified function, saving the original function on a stack
  $$.fn.interceptPush = function(targetObj, targetFnName, _fnTemp, frameAttrs) {
// $$.LOG.warn("interceptPush " + (frameAttrs ? frameAttrs : ""));
    var frame = {
       targetObj: targetObj
      ,targetFnName: targetFnName
      ,savedFn: targetObj[targetFnName]
      ,attrs: frameAttrs
    };
    $$.fn.interceptStack.push(frame);
    targetObj[targetFnName] = _fnTemp;
  };
  // restore the most recent function replacement
  $$.fn.interceptPop = function() {
    var frame = $$.fn.interceptStack.pop();
// $$.LOG.warn("interceptPop " + (frame.attrs ? frame.attrs : ""));
    frame.targetObj[frame.targetFnName] = frame.savedFn;
  };
  $$.fn.getInterceptTop = function() {
    return $$.fn.interceptStack[$$.fn.interceptStack.length-1];
  };

  // replace the specified function, but then restore the original function as soon as it is call
  $$.fn.interceptOnce = function(targetObj, targetFnName, _fn) {
    $$.fn.interceptPush(targetObj, targetFnName, function(){
      $$.fn.interceptPop(); // un-intercept
      var args = Array.prototype.slice.call(arguments);
      _fn.apply(this, args);    });
  };

}(selblocks));
