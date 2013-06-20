'use strict';

var style, add;
if (document.createStyleSheet) {
	// IE
	if (document.styleSheets.length > 29) {
		style = document.styleSheets[document.styleSheets.length - 1];
	} else {
		style = document.createStyleSheet();
	}
	add = function (css) { style.cssText += css; };
} else {
	style = document.getElementsByTagName("head")[0]
		.appendChild(document.createElement("style"));
	style.setAttribute("type", "text/css");
	add = function (css) { style.appendChild(document.createTextNode(css)); };
}
module.exports = add;
