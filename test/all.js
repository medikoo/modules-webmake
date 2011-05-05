var webbuild = require('../lib/webbuild');

var input = __dirname + '/playground/program.js';
var output = __dirname + '/build.js';

exports["test Build"] = function (assert, done) {
	webbuild(input, output, function (err) {
		if (err) {
			assert.fail(err);
			done();
			return;
		}
		var program = require('./build');

		assert.equal(typeof program.a, "object",
			"require module");
		assert.equal(program.a.name, 'a',
			"make sure it's expected module");
		var c = program.a.getC();
		assert.equal(c.name, 'c',
			"require module via defered call");
		var c2 = program.a.getC();
		assert.ok(c === c2,
			"require same module twice (both calls should return same object)");
		assert.equal(c.b.name, 'b',
			"require within required module");
		assert.ok(c === c.b.c,
			"circular dependency");
		done();
	});
};

if (module == require.main) {
	require('test').run(exports);
}
