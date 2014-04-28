'use strict';

var webmake         = require('../../../')

  , pg = require('path').resolve(__dirname, '../../__playground');

module.exports = function (t, a, d) {
	webmake(pg + '/lib/browser-test.js')(function (result) {
		result = eval(result);
		a(result.style.innerHTML, 'body { color: black; background: white; }');
		a(result.html.innerHTML, '<p><span>Hello!</span></p>');
	}).done(d, d);
};
