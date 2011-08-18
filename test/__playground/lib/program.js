exports.x = require('./x');
exports.y = require('./y.js');
exports.indexed = require('./indexed');
exports.outer = require('../outer');

exports.external = {
	main:  require('test'),
	other: require('test/lib/other.js'),
	noMain: require('no-main/lib/some-module')
};
