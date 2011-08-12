exports.x = require("./x");
exports.y = require("./y.js");
exports.outer = require("../outer");

exports.external = {
	main:  require('test'),
	other: require('test/lib/other.js'),
	noMain: require('no-main/lib/some-module')
};
