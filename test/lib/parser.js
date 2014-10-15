'use strict';

var deferred = require('deferred')
  , resolve  = require('path').resolve
  , readFile = require('fs2/read-file')

  , keys = Object.keys, pg = resolve(__dirname, '../__playground');

module.exports = {
	"": function (t, a, d) {
		var input, parser;
		input = resolve(pg, 'lib/program.js');
		parser = t();
		parser.readInput(input)(function (path) {
			a(path, "__playground/lib/program", "Path");
			a.deep(Object.keys(parser.modules).sort(),
				['__playground', 'no-main', 'path', 'test'], "Modules");
		}).done(d, d);
	},
	Transform: function (t, a, d) {
		var input, parser, map = {};
		input = resolve(pg, 'lib/program.js');
		parser = t({ transform: function (filename, code) {
			map[filename] = code;
			return "'use strict'; module.exports = 'foo';";
		} });
		parser.readInput(input)(function (path) {
			a(path, "__playground/lib/program", "Path");
			a.deep(Object.keys(parser.modules).sort(),
				['__playground'], "Modules");
			return deferred.map(keys(map), function (path) {
				return readFile(path)(function (content) { a(map[path], String(content), path); });
			})(function () { return null; });
		}).done(d, d);
	}
};
