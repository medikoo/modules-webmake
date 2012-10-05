'use strict';

var resolve = require('path').resolve

  , pg = __dirname + '/__playground';

module.exports = {
	"": function (t, a, d) {
		var input, parser;
		input = resolve(pg, 'lib/program.js');
		parser = t();
		parser.readInput(input)(function (path) {
			a(path, "__playground/lib/program", "Path");
			a.deep(Object.keys(parser.modules).sort(),
				['__playground', 'no-main', 'path', 'test'], "Modules");
		}).end(d);
	}
};
