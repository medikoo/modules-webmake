'use strict';

var pg = __dirname + '/__playground';

module.exports = {
	"": function (t, a, d) {
		var input, parser;
		input = pg + '/lib/program.js'
		parser = t();
		parser.readInput(input)
		(function (path) {
			a(path, "__playground/lib/program", "Path");
			a.deep(Object.keys(parser.modules).sort(),
				['__playground', 'no-main', 'test'], "Modules");
		})(d, d).end();
	}
};
