#!/usr/bin/env node

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
exports.commonPathPart = require('./sub-longer/bar');
exports.commonRootPathPart = require('../sub-longer/bar');
exports.outerId = require('./sub/inner/inner').modId;
exports.pathOther = require('./path/other');
exports.nodeshim = require('path');
exports.json = require('./mario');
exports.modId = module.id;

try {
	require('./optional-module');
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND') throw e;
}

try {
	require('optional-package');
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND') throw e;
}

// new line/comment check
require('./nl-comment')(exports);

try {
	require('util'); // optional native package
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND') throw e;
}
exports.included = {
	a: indirectRequire('./included/a'),
	b: indirectRequire('./included/b')
};

exports.external = {
	main:  require('test'),
	other: require('test/lib/other.js'),
	noMain: require('no-main/lib/some-module')
};

try {
	require('test/marko/optional-module-of-outer-package');
} catch (e) {
	if (e.code !== 'MODULE_NOT_FOUND') throw e;
}
