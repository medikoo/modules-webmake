var indirectRequire = require;

exports.x = require('./x');
exports.y = require('./y.js');
exports.indexed = require('./indexed');
exports.outer = require('../outer');
exports.outerSubIndex = require('../other/sub/')
exports.pathFile = require('./path');
exports.pathDir = require('./path/');
exports.pathIndex = require('./path/index');
exports.pathOther = require('./path/other');

// new line/comment check
require('./nl-comment')(exports);

exports.included = {
	a: indirectRequire('./included/a'),
	b: indirectRequire('./included/b')
};

exports.external = {
	main:  require('test'),
	other: require('test/lib/other.js'),
	noMain: require('no-main/lib/some-module')
};
