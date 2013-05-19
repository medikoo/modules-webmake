'use strict';

var startsWith      = require('es5-ext/lib/String/prototype/starts-with')
  , lock            = require('es5-ext/lib/Function/prototype/lock')
  , promisify       = require('deferred').promisify
  , fs              = require('fs')
  , runInNewContext = require('vm').runInNewContext

  , readFile = promisify(fs.readFile), unlink = promisify(fs.unlink)

  , pg = __dirname + '/__playground';

module.exports = {
	"": function (t, a, d) {
		var input = pg + '/lib/program.js'
		  , output = pg + '/build.js'
		  , options = { include: pg + '/lib/included', ignores: ["'./included/' + key"]};
		t = promisify(t);
		t(input, options)(function (result) {
			var program = runInNewContext(result, {});
			a(program.x.name, 'x', "Same path require");
			a(program.x.getZ().name, 'z', "Deferred call");
			a(program.x.getZ(), program.x.getZ(),
				"Requiring same object twice, should return same object");
			a(program.y.z.name, 'z', "Require within required module");
			a(program.y.z.y.name, 'y', "Circular dependency");
			a(program.dirjs, 'DIR.JS', "Directory with '.js' extension");
			a(program.indexed.name, 'indexed', "Folder index");
			a(program.included.a.name, 'included.a', "Manually included #1");
			a(program.included.b.name, 'included.b', "Manually included #2");
			a(program.outer.name, 'outer', "Require module up tree");
			a(program.outerSubIndex.name, 'outer-index',
				"Require index from sibling directory");
			a(program.pathFile.name, 'path.js', "Dir/file collision: file");
			a(program.pathDir.name, 'path', "Dir/file collision: dir");
			a(program.pathIndex.name, 'path', "Dir/file collision: dir/index");
			a(program.pathOther.name, 'path/other', "Dir/file collision: other");
			a(program.pathOther.index.name, 'path', "'.' - index require");
			a(program.pathOther.indexSlash.name, 'path',
				"'./' - index require (slash)");
			a(program.pathOther.parentIndex, 'main.index', "'..' - parent index");
			a(program.pathOther.parentIndexSlash,
				'main.index', "'../' - parent index (slash)");
			a(program.nlComment, 'nlComment', "New line / Comment");
			a(program.external.other.name, 'external-other',
				"Require module from other package");
			a(program.external.other.main, program.external.main,
				"Require dir by package.json");
			a(program.external.main.name, 'external-main',
				"Require main module from other package");
			a(program.external.main.module.name, 'module',
				"Require module within other package");
			a(program.external.noMain.name, 'no-main',
				"Require from package that doesn't have main module");
			a(program.nodeshim, 'path for web');
			a.deep(program.json, { "raz": 0, "dwa": "trzy", "pięć": false,
				"cztery": null, "osiem:": undefined }, "JSON");

			a(program.circularOther, 'circTest', "Partially broken dependecy test");

			a(program.getC('c'), 'included.c', 'File contains exclude file');
			a(program.included.c.name, 'included.c', "Manually included #3");

			options.output = output;
			return t(input, options)(lock.call(readFile, output, 'utf8'))(
				function (content) {
					a(result, content, "Write to file");
					return unlink(output);
				}
			);
		}).end(d);
	},
	"No includes": function (t, a, d) {
		var input = pg + '/lib/x.js';
		t = promisify(t);
		t(input)(function (result) {
			var program = runInNewContext(result, {}, input);
			a(program.name, 'x', "Same path require");
			a(program.getZ().name, 'z', "External name");
		}).end(d);
	},
	"Unresolved path": function (t, a, d) {
		var input = pg + '/././lib/x.js';
		t = promisify(t);
		t(input)(function (result) {
			var program = runInNewContext(result, {}, input);
			a(program.name, 'x', "Same path require");
			a(program.getZ().name, 'z', "External name");
		}).end(d);
	},
	"Error on native": function (t, a, d) {
		t(pg + '/require-native.js', function (err) {
			a.ok(startsWith.call(err.message, "Cannot require"));
			d();
		});
	}
};
