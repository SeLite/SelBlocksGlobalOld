/* Copyright 2011 Chris Noe
 * Copyright 2015, 2016 Peter Kehl
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 1.1. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/1.1/.
 */
// SelBlocks name-space
"use strict";

var selblocks = {
   name: "selblocks"
  ,seleniumEnv: "ide"
  ,globalContext: this // alias for global Selenium scope
};

(function($$){
  $$.fn = {};

  /* Starting with FF4 lots of objects are in an XPCNativeWrapper,
   * and we need the underlying object for == and for..in operations.
   */
  $$.unwrapObject = function unwrapObject(obj) {
    if (typeof(obj) === "undefined" || obj == null)
      return obj;
    if (obj.wrappedJSObject)
      return obj.wrappedJSObject;
    return obj;
  };

  $$.fmtCmd = function fmtCmd(cmd) {
    var c = cmd.command!==undefined
        ? cmd.command.trimLeft() // trimLeft() is for commands indented with whitespace (when using SeLite ClipboardAndIndent)
        : cmd.command;
    if (cmd.target) { c += "|" + cmd.target; }
    if (cmd.value)  { c += "|" + cmd.value; }
    return c;
  }

}(selblocks));
