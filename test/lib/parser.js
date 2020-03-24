"use strict";

const deferred    = require("deferred")
    , { resolve } = require("path")
    , readFile    = require("fs2/read-file");

const { keys } = Object, pg = resolve(__dirname, "../__playground");

module.exports = {
	""(t, a, d) {
		const input = resolve(pg, "lib/program.js");
		const parser = t();
		parser
			.readInput(input)(path => {
				a(path, "__playground/lib/program", "Path");
				a.deep(
					Object.keys(parser.modules).sort(),
					["@scope/package", "__playground", "no-main", "path", "regular", "test"],
					"Modules"
				);
			})
			.done(d, d);
	},
	"Transform"(t, a, d) {
		const map = {};
		const input = resolve(pg, "lib/program.js");
		const parser = t({
			transform(filename, code) {
				map[filename] = code;
				return "'use strict'; module.exports = 'foo';";
			}
		});
		parser
			.readInput(input)(path => {
				a(path, "__playground/lib/program", "Path");
				a.deep(Object.keys(parser.modules).sort(), ["__playground"], "Modules");
				return deferred.map(keys(map), filePath =>
					readFile(filePath)(content => { a(map[filePath], String(content), filePath); })
				)(() => null);
			})
			.done(d, d);
	}
};
