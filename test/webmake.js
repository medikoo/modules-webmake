'use strict';

var fs         = require('fs')
  , startsWith = require('es5-ext/lib/String/starts-with').call
  , vm = require('vm')

  , writeFile = fs.writeFile, unlink = fs.unlink

  , pg = __dirname + '/__playground';

module.exports = {
	"": function (t, a, d) {
		var output = pg + '/build.js';
		t(pg + '/lib/program.js', function (err, result) {
			if (err) {
				d(err);
				return;
			}

			var ctx = {
				name: 'true-global'
			};
			vm.runInNewContext('var program = ' + result, ctx);
			var program = ctx.program;

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

			a(program.thisTest, 'available',
				"Export by 'this'");
			a(program.globalAvailable, true,
				"'global' is available in module scope");
			a(program.globalName, 'true-global',
				"'global' in module is true global context");
	
			d();
		});
	},
	"Error on native": function (t, a, d) {
		t(pg + '/require-native.js', function (err) {
			a.ok(startsWith(err.message, "Cannot require")); d();
		});
	}
};
