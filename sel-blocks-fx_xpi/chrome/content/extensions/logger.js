// selbocks name-space
"use strict";

// Following assignments is purely for JSDoc.
/** @namespace */
selblocks= selblocks;

/* LOG wrapper for SelBlocks-specific behavior
   */
selblocks.Logger= function Logger() {};
/** Log an error */
selblocks.Logger.prototype.error = function (msg) { this.logit("error", msg); };
selblocks.Logger.prototype.warn  = function (msg) { this.logit("warn", msg); };
selblocks.Logger.prototype.info  = function (msg) { this.logit("info", msg); };
selblocks.Logger.prototype.debug = function (msg) { this.logit("debug", msg); };
selblocks.Logger.prototype.trace = function (msg) { this.logit("debug", msg); }; // selenium doesn't have trace level

selblocks.Logger.prototype.logit = function (logLevel, msg) {
  LOG[logLevel]("[" + $$.name + "] " + msg);  // call the Selenium logger
};

// ==================== Stack Tracer ====================
/** Generate stack trace.
 *  @param {Error|undefined} [err]
 *  @returns {Array} */
selblocks.Logger.prototype.genStackTrace = function(err)
{
  var e = err || new Error();
  var stackTrace = [];
  if (!e.stack)
    stackTrace.push("No stack trace, (Firefox only)");
  else {
    var funcCallPattern = /^\s*[A-Za-z0-9\-_\$]+\(/;
    var lines = e.stack.split("\n");
    for (var i=0; i < lines.length; i++) {
      if (lines[i].match(funcCallPattern))
        stackTrace.push(lines[i]);
    }
    if (!err)
      stackTrace.shift(); // remove the call to genStackTrace() itself
  }
  return stackTrace;
};

/** Log stack trace.
 * @param {Error|undefined} [err]
 */
selblocks.Logger.prototype.logStackTrace = function(err)
{
  var t = this.genStackTrace(err);
  if (!err)
    t.shift(); // remove the call to logStackTrace() itself
  this.warn("__Stack Trace__");
  for (var i = 0; i < t.length; i++) {
    this.warn("@@ " + t[i]);
  }
};

/** Describe the calling function.
*/
selblocks.Logger.prototype.descCaller = function()
{
  var t = this.genStackTrace(new Error());
  if (t.length == 0) return "no client function";
  t.shift(); // remove the call to descCaller() itself
  if (t.length == 0) return "no caller function";
  t.shift(); // remove the call to client function
  if (t.length == 0) return "undefined caller function";
  return "caller: " + t[0];
};

/** @member {Logger} */
selblocks.LOG = new selblocks.Logger();
