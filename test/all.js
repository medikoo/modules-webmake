var webmake = require('../lib/webmake');

var input = __dirname + '/playground/program.js';
var output = __dirname + '/build.js';

exports["test make"] = function (assert, done) {
	webmake(input, output, function (err) {
		if (err) {
			assert.fail(err);
			done();
			return;
		}
		var program = require('./build');

		assert.ok(program.a instanceof Object,
			"require module");
		assert.equal(program.a.name, 'a',
			"make sure it's expected module");
		var c = program.a.getC();
		assert.equal(c && c.name, 'c',
			"require module via defered call");
		assert.ok(c === program.a.getC(),
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
