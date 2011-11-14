'use strict';

var stringify    = JSON.stringify
  , fs           = require('fs')
  , getArray     = require('es5-ext/lib/Array/get-array')
  , aritize      = require('es5-ext/lib/Function/aritize').call
  , invoke       = require('es5-ext/lib/Function/invoke')
  , isFunction   = require('es5-ext/lib/Function/is-function')
  , lock         = require('es5-ext/lib/Function/lock').call
  , rcurry       = require('es5-ext/lib/Function/rcurry').call
  , count        = require('es5-ext/lib/Object/plain/count').call
  , all          = require('deferred/lib/join/all')
  , ba2p         = require('deferred/lib/async-to-promise').bind
  , filesAtPath  = ba2p(require('next/lib/fs/files-at-path'))
  , createParser = require('./parser')

  , readFile = ba2p(fs.readFile), writeFile = ba2p(fs.writeFile)

  , templatePath;

require('deferred/lib/ext/cb');

templatePath = __dirname + '/webmake.tpl';

module.exports = function (input, options, cb) {
	if (isFunction(options)) {
		cb = options;
		options = {};
	}
	var parser = createParser();
	parser.readInput(input)
	(function (path) {
		return all(getArray(options.include),
			aritize(filesAtPath, 1),
			invoke('filter', function (filename) {
				return filename.slice(-3) === '.js';
			}),
			rcurry(all, parser.readInput.bind(parser)))
		(lock(readFile, templatePath, 'utf8'))
		(function (tpl) {
			// console.log("MODULES", parser.modulesFiles);
			// console.log("MODULES COUNT: ", parser.modulesFiles.length);
			// console.log("PACKAGES COUNT: ", count(parser.packages));
			var src = tpl +
				'(' + parser.toString() + ')\n' +
				'(' + stringify(path) + ');\n';
			return options.output ? writeFile(options.output, src) : src;
		});
	}).cb(cb);
};
