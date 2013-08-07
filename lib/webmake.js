'use strict';

var isFunction   = require('es5-ext/lib/Function/is-function')
  , deferred     = require('deferred')
  , resolve      = require('path').resolve
  , stat         = deferred.promisify(require('fs').stat)
  , readFile     = require('fs2/lib/read-file')
  , writeFile    = require('fs2/lib/write-file')
  , readdir      = require('fs2/lib/readdir')
  , createParser = require('./parser')

  , now = Date.now, stringify = JSON.stringify
  , templatePath = __dirname + '/webmake.tpl'
  , separator = (process.env.OS === 'Windows_NT') ? '/[\\\\/]/' : '\'/\''
  , filesAtPath;

filesAtPath = function (path) {
	return stat(path)(function (stats) {
		if (stats.isFile()) return [path];
		if (stats.isDirectory()) {
			return readdir(path, { depth: Infinity, type: { file: true } })(
				function (data) {
					return data.map(function (file) { return resolve(path, file); });
				}
			);
		}
		return [];
	});
};

module.exports = function (input, options, cb) {
	var promise, parser, time;
	if (isFunction(options)) {
		cb = options;
		options = {};
	} else {
		options = Object(options);
	}
	time = now();
	parser = createParser(options);
	promise = parser.readInput(input)(function (path) {
		return deferred.map([].concat(options.include || []), function (path) {
			path = resolve(String(path));
			return filesAtPath(path).invoke('filter', function (filename) {
				return filename.slice(-3) === '.js';
			}).map(parser.readInput, parser);
		})(function () { return readFile(templatePath, 'utf-8'); })(function (tpl) {
			var src = tpl.replace('SEPARATOR', separator)
				.replace('EXTENSIONS', stringify(parser.extNames)) +
				'(' + parser.toString() + ')' +
				'(' + stringify(path) + ');\n';
			return options.output ?
					writeFile(resolve(String(options.output)), src)(parser) : src;
		});
	}).cb(cb);
	promise.time = now() - time;
	promise.parser = parser;
	return promise;
};
