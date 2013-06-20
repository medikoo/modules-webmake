'use strict';

var document;

try {
	document = require('jsdom').jsdom();
} catch (e) {}

exports.context = document ? { document: document } : {};
