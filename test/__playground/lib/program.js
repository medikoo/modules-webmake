exports.x = require("./x");
exports.y = require("./y");
exports.outer = require("../outer");

exports.external = {
	main:  require('test'),
	other: require('test/lib/other')
};
