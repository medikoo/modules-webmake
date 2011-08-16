'use strict';

var fs         = require('fs')
  , startsWith = require('es5-ext/lib/String/starts-with').call
  , lock       = require('es5-ext/lib/Function/lock').call
  , ba2p       = require('deferred/lib/async-to-promise').bind

  , writeFile = ba2p(fs.writeFile), readFile = ba2p(fs.readFile)
  , unlink = ba2p(fs.unlink)

  , pg = __dirname + '/__playground';

module.exports = {
	"": function (t, a, d) {
		var input = pg + '/lib/program.js'
		  , output = pg + '/build.js';
		t = ba2p(t);
		t(input)
		(function (result) {
			return writeFile(output, 'module.exports = ' + result)
			(function () {
				var program = require(output);
				a(program.x.name, 'x', "Same path require");
				a(program.x.getZ().name, 'z', "Deferred call");
				a(program.x.getZ(), program.x.getZ(),
					"Requiring same object twice, should return same object");
				a(program.y.z.name, 'z', "Require within required module");
				a(program.y.z.y.name, 'y', "Circular dependency");
				a(program.outer.name, 'outer', "Require module up tree");
				a(program.external.other.name, 'external-other',
					"Require module from other package");
				a(program.external.main.name, 'external-main',
					"Require main module from other package");
				a(program.external.main.module.name, 'module',
					"Require module within other package");
				a(program.external.noMain.name, 'no-main',
					"Require from package that doesn't have main module");

				return unlink(output)
				(function () {
					return t(input, output)
					(lock(readFile, output, 'utf8'))
					(function (content) {
						a(result, content, "Write to file");
						return unlink(output);
					});
				});
			});
		}).cb(d);
	},
	"Error on native": function (t, a, d) {
		t(pg + '/require-native.js', function (err) {
			a.ok(startsWith(err.message, "Cannot require")); d();
		});
	}
};
