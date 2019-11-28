"use strict";

let jsdomDocument;

try { jsdomDocument = new (require("jsdom")).JSDOM().window.document; }
catch (ignore) {}

if (jsdomDocument) {
	exports.context = { Buffer, document: jsdomDocument, process, setTimeout, clearTimeout };
}
