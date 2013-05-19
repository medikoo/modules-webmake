var indirectRequire = require;

exports.x = require('./x');
exports.y = require('./y.js');
exports.dirjs = require('./dir.js');
exports.indexed = require('./indexed');
exports.outer = require('../outer');
require('./circular-other');
exports.circularOther = require('./circular-other');
exports.outerSubIndex = require('../other/sub/')
exports.pathFile = require('./path');
exports.pathDir = require('./path/');
exports.pathIndex = require('./path/index');
exports.pathOther = require('./path/other');
exports.nodeshim = require('path');
exports.json = require('./mario');

// new line/comment check
require('./nl-comment')(exports);

exports.included = {
	a: indirectRequire('./included/a'),
	b: indirectRequire('./included/b'),
    c: indirectRequire('./included/c')
};

exports.external = {
	main:  require('test'),
	other: require('test/lib/other.js'),
	noMain: require('no-main/lib/some-module')
};

exports.getC = require('./exclude').getC;
