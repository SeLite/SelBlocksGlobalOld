"use strict";
SeLiteExtensionSequencer.registerPlugin( {
    name: 'SeLite SelBlocks Global',
    id: 'selblocks-global@selite.googlecode.com',
    coreURL: [
      'chrome://selite-selblocks-global/content/extensions/name-space.js',
      'chrome://selite-selblocks-global/content/extensions/logger.js',
      'chrome://selite-selblocks-global/content/extensions/function-intercepting.js',
      'chrome://selite-selblocks-global/content/extensions/xpath-processing.js',
      'chrome://selite-selblocks-global/content/extensions/expression-parser.js',
      'chrome://selite-selblocks-global/content/extensions/selenium-executionloop-handleAsExitTest.js',
      'chrome://selite-selblocks-global/content/extensions/selenium-executionloop-handleAsTryBlock.js',
      'chrome://selite-selblocks-global/content/extensions/selblocks.js'
    ],
    xmlURL: 'chrome://selite-selblocks-global/content/reference.xml',
    infoURL: 'https://addons.mozilla.org/en-US/firefox/addon/selite-selblocks-global/',
    requisitePlugins: {
        'testcase-debug-context@selite.googlecode.com': {
            name: 'SeLite TestCase Debug Context',
            infoURL: 'https://addons.mozilla.org/en-US/firefox/addon/selite-testcase-debug-conte/',
            minVersion: '0.76'
        },
        'misc@selite.googlecode.com': {
            name: 'SeLite Miscellaneous',
            infoURL: 'https://addons.mozilla.org/en-US/firefox/addon/selite-miscellaneous/',
            minVersion: '0.87'
        }
    }
} );
