'use strict';

var webmake         = require('../../')

  , pg = require('path').resolve(__dirname, '../__playground');

module.exports = function (t, a, d) {
	webmake(pg + '/lib/css-test.js')(function (result) {
		var style = eval(result);
		a(style.innerHTML, 'body { color: black; background: white; }');
	}).end(d);
};
