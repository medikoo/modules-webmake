var unlink = require('fs').unlink
  , pg = __dirname + '/__playground';

module.exports = function (t, a, d) {
	var output = pg + '/build.js';
	t(pg + '/program.js', output, function (err) {
		if (err) {
			d(err);
			return;
		}
		var program = require(output);

		a.ok(program.a instanceof Object, "Require module");
		a(program.a.name, 'a', "Make sure it's expected module");
		var c = program.a.getC();
		a(c && c.name, 'c', "Require module via defered call");
		a.ok(c === program.a.getC(),
			"Require same module twice (both calls should return same object)");
		a(c.b.name, 'b', "Require within required module");
		a.ok(c === c.b.c, "Circular dependency");

		unlink(output, d);
	});
};
