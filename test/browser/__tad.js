'use strict';

var document;

try {
	document = require('jsdom').jsdom();
} catch (ignore) {}

if (document) {
	exports.context = {
		document: document,
		process: process,
		setTimeout: setTimeout,
		clearTimeout: clearTimeout
	};
}
