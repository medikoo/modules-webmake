"use strict";

var jsdomDocument;

try {
	jsdomDocument = new (require("jsdom")).JSDOM().window.document;
} catch (ignore) {}

if (jsdomDocument) {
	exports.context = {
		document: jsdomDocument,
		process: process,
		setTimeout: setTimeout,
		clearTimeout: clearTimeout
	};
}
