'use strict';

var isArray      = Array.isArray
  , stringify    = JSON.stringify
  , resolve      = require('path').resolve
  , invoke       = require('es5-ext/lib/Function/invoke')
  , isFunction   = require('es5-ext/lib/Function/is-function')
  , count        = require('es5-ext/lib/Object/count')
  , deferred     = require('deferred')
  , stat         = deferred.promisify(require('fs').stat)
  , createParser = require('./parser')
  , readFile     = require('next/lib/fs/read-file')
  , writeFile    = require('next/lib/fs/write-file')
  , readdir      = require('next/lib/fs/readdir')

  , separator = (process.env.OS === 'Windows_NT') ? '/[\\\\/]/' : '\'/\''

  , templatePath, filesAtPath;

templatePath = __dirname + '/webmake.tpl';

filesAtPath = function (path) {
	return stat(path)(function (stats) {
		if (stats.isFile()) {
			return [path];
		} else if (stats.isDirectory()) {
			return readdir(path, { depth: Infinity, type: { file: true } })(
				function (data) {
					return data.map(function (file) {
						return resolve(path, file);
					});
				});
		} else {
			return [];
		}
	});
};

module.exports = function (input, options, cb) {
	if (isFunction(options)) {
		cb = options;
		options = {};
	} else {
		options = Object(options);
	}
	var parser = createParser();
	return parser.readInput(input)(function (path) {
		return deferred.map([].concat(options.include || []), function (path) {
			path = resolve(String(path));
			return filesAtPath(path).invoke('filter', function (filename) {
				return filename.slice(-3) === '.js';
			}).map(parser.readInput, parser);
		})(function () {
			return readFile(templatePath, 'utf-8');
		}, function (err) {
			return err;
		})(function (tpl) {
			// console.log("MODULES", parser.modulesFiles);
			// console.log("MODULES COUNT: ", parser.modulesFiles.length);
			// console.log("PACKAGES COUNT: ", count(parser.packages));
			var src = tpl.replace('SEPARATOR', separator) +
				'(' + parser.toString(options) + ')\n' +
				'(' + stringify(path) + ');\n';
			return options.output ?
					writeFile(resolve(String(options.output)), src) : src;
		});
	}).cb(cb);
};
