'use strict';

var document;

try {
	document = require('jsdom').jsdom();
} catch (ignore) {}

exports.context = document ? { document: document } : {};
