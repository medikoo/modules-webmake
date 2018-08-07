"use strict";

let deferred = require("deferred")
  , resolve  = require("path").resolve
  , readFile = require("fs2/read-file")

  , keys = Object.keys, pg = resolve(__dirname, "../__playground");

module.exports = {
	""(t, a, d) {
		let input, parser;
		input = resolve(pg, "lib/program.js");
		parser = t();
		parser.readInput(input)(path => {
			a(path, "__playground/lib/program", "Path");
			a.deep(Object.keys(parser.modules).sort(),
				["__playground", "no-main", "path", "test"], "Modules");
		}).done(d, d);
	},
	Transform(t, a, d) {
		let input, parser, map = {};
		input = resolve(pg, "lib/program.js");
		parser = t({ transform(filename, code) {
			map[filename] = code;
			return "'use strict'; module.exports = 'foo';";
		} });
		parser.readInput(input)(path => {
			a(path, "__playground/lib/program", "Path");
			a.deep(Object.keys(parser.modules).sort(),
				["__playground"], "Modules");
			return deferred.map(keys(map), path => readFile(path)(content => { a(map[path], String(content), path); }))(() => null);
		}).done(d, d);
	}
};
