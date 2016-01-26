/* Copyright 2011 Chris Noe
 * Copyright 2015, 2016 Peter Kehl
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 1.1. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/1.1/.
 */
"use strict";
// SelBlocks name-space
(function($$){

  // Adapted from the datadriven plugin
  // http://web.archive.org/web/20120928080130/http://wiki.openqa.org/display/SEL/datadriven

  // ==================== XmlReader ====================

  $$.fn.XmlReader = function XmlReader()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load XML file and return the list of var names found in the first <VARS> element
    this.load = function load(filepath)
    {
      var xmlHttpReq = doAjaxRequest(filepath, "text/xml");
      var fileObj = xmlHttpReq.responseXML; // XML DOM
      varsets = fileObj.getElementsByTagName("vars"); // HTMLCollection
      if (varsets === null || varsets.length === 0) {
        throw new Error("A <vars> element could not be loaded, or <testdata> was empty.");
      }

      curVars = 0;
      varNames = $$.fn.XmlReader.attrNamesFor(varsets[0]);
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
      $$.LOG.debug(varsetIdx + ") " + $$.fn.XmlReader.serializeXml(varsets[curVars]));  // log each name & value

      var expected = $$.fn.XmlReader.countAttrs(varsets[0]);
      var found = $$.fn.XmlReader.countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent <testdata> at <vars> element #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each <vars> element must have the same set of attributes."
        );
      }
      $$.fn.XmlReader.setupStoredVars(varsets[curVars]);
      curVars++;
    };
  };

    //- retrieve the names of each attribute on the given XML node
    $$.fn.XmlReader.attrNamesFor= function attrNamesFor(node) {
      var attrNames = [];
      var varAttrs = node.attributes; // NamedNodeMap
      var v;
      for (v = 0; v < varAttrs.length; v++) {
        attrNames.push(varAttrs[v].nodeName);
      }
      return attrNames;
    };

    //- determine how many attributes are present on the given node
    $$.fn.XmlReader.countAttrs= function countAttrs(node) {
      return node.attributes.length;
    };

    //- set selenium variables from given XML attributes
    $$.fn.XmlReader.setupStoredVars= function setupStoredVars(node) {
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
    $$.fn.XmlReader.serializeXml= function serializeXml(node) {
      if (XMLSerializer !== "undefined") {
        return (new XMLSerializer()).serializeToString(node) ;
      }
      if (node.xml) { return node.xml; }
      throw "XMLSerializer is not supported or can't serialize " + node;
    };

  // ==================== JSONReader ====================

  $$.fn.JSONReader = function JSONReader()
  {
    var varsets = null;
    var varNames = null;
    var curVars = null;
    var varsetIdx = 0;

    // load JSON file and return the list of var names found in the first object
    this.load = function(filepath)
    {
      var xmlHttpReq = doAjaxRequest(filepath);
      var fileObj = xmlHttpReq.responseText;
      fileObj = fileObj.replace(/\0/g, "");
      if (fileObj.charCodeAt(0) == 65533 && fileObj.charCodeAt(1) == 65533) {
        // strip UTF marker if present
        fileObj = fileObj.substr(2);
      }
      $$.LOG.info(fileObj);
      varsets = $$.evalWithVars(fileObj);
      if (varsets === null || varsets.length === 0) {
        throw new Error("A JSON object could not be loaded, or the file was empty.");
      }

      curVars = 0;
      varNames = $$.fn.JSONReader.attrNamesFor(varsets[0]);
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
      $$.LOG.debug(varsetIdx + ") " + $$.fn.JSONReader.serializeJson(varsets[curVars]));  // log each name & value

      var expected = countAttrs(varsets[0]);
      var found = countAttrs(varsets[curVars]);
      if (found !== expected) {
        throw new Error("Inconsistent JSON object #" + varsetIdx
          + "; expected " + expected + " attributes, but found " + found + "."
          + " Each JSON object must have the same set of attributes."
        );
      }
      $$.fn.JSONReader.setupStoredVars(varsets[curVars]);
      curVars++;
    };
  };

    //- retrieve the names of each attribute on the given object
    $$.fn.JSONReader.attrNamesFor= function attrNamesFor(obj) {
      var attrNames = [];
      var attrName;
      for (attrName in obj) {
        attrNames.push(attrName);
      }
      return attrNames;
    };

    //- determine how many attributes are present on the given obj
    $$.fn.JSONReader.countAttrs= function countAttrs(obj) {
      var n = 0;
      var attrName;
      for (attrName in obj) {
        n++;
      }
      return n;
    };

    //- set selenium variables from given JSON attributes
    $$.fn.JSONReader.setupStoredVars= function setupStoredVars(obj) {
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
    $$.fn.JSONReader.serializeJson= function serializeJson(obj) {
      // firefox provides uneval()
      if (typeof uneval === "function") {
        var json = uneval(obj);
        return json.substring(1, json.length-1);
      }
      // others
      var buf = "";
      for (var attr in obj) {
        buf += " " + attr + ": " + obj[attr];
      }
      return "{" + buf + " }";
    };

  function doAjaxRequest(filepath, mimeType)
  {
      var fileReader = new FileReader();
      var fileUrl;
      // in order to not break existing tests, the IDE will still use urlFor,
      // on the server, accessible with proper CORS headers.
      if ($$.seleniumEnv == "ide") {
        fileUrl = urlFor(filepath);
      } else {
        fileUrl = filepath;
      }
      var xmlHttpReq = fileReader.getDocumentSynchronous(fileUrl, mimeType);
      $$.LOG.info("Reading from: " + fileUrl);
      return xmlHttpReq;
  }

  function urlFor(filepath) {
    if (filepath.indexOf("http") == 0) {
      return filepath;
    }
    var URL_PFX = "file://";
    var url = filepath;
    if (filepath.substring(0, URL_PFX.length).toLowerCase() !== URL_PFX) {
      var testCasePath = testCase.file.path.replace("\\", "/", "g");
      var i = testCasePath.lastIndexOf("/");
      url = URL_PFX + testCasePath.substr(0, i) + "/" + filepath;
    }
    return url;
  }


  // ==================== File Reader ====================
  // Adapted from the include4ide plugin

  function FileReader() {}

  FileReader.prototype.prepareUrl = function(url) {
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

  FileReader.prototype.getDocumentSynchronous = function(url, mimeType) {
    var absUrl = this.prepareUrl(url);
    var requester = this.newXMLHttpRequest();
    if (!requester) {
      throw new Error("XMLHttp requester object not initialized");
    }
    if (mimeType) {
      requester.overrideMimeType(mimeType);
    }
    requester.open("GET", absUrl, false); // synchronous (we don't want selenium to go ahead)
    try {
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

  FileReader.prototype.newXMLHttpRequest = function() {
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
