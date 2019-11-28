"use strict";

const webmake = require("../../../")
    , pg      = require("path").resolve(__dirname, "../../__playground");

module.exports = function (t, a, d) {
	webmake(`${ pg }/lib/browser-test.js`)(result => {
		// eslint-disable-next-line no-eval
		result = eval(result);
		a(result.style.innerHTML, "body {\n\tcolor: black;\n\tbackground: white;\n}");
		a(result.html.innerHTML, "<p><span>Hello!</span></p>\n");
	}).done(d, d);
};
