'use strict';

var contains     = require('es5-ext/array/#/contains')
  , isFunction   = require('es5-ext/function/is-function')
  , some         = require('es5-ext/object/some')
  , deferred     = require('deferred')
  , path         = require('path')
  , stat         = deferred.promisify(require('fs').stat)
  , readFile     = require('fs2/read-file')
  , writeFile    = require('fs2/write-file')
  , readdir      = require('fs2/readdir')
  , createParser = require('./lib/parser')

  , now = Date.now, stringify = JSON.stringify
  , resolve = path.resolve, extname = path.extname
  , templatePath = resolve(__dirname, 'lib/webmake.tpl')
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
	promise = parser.readInput(input, options)(function (path) {
		return deferred.map([].concat(options.include || []), function (path) {
			path = resolve(String(path));
			return filesAtPath(path).invoke('filter', function (filename) {
				var ext = extname(filename);
				if (ext === '.js') return true;
				if (ext === '.json') return true;
				if (ext === '.css') return true;
				if (ext === '.html') return true;
				return some(parser.extNames, function (data) { return contains.call(data, ext); });
			}).map(parser.readInput, parser);
		})(function () { return readFile(templatePath, 'utf-8'); })(function (tpl) {
			var src = tpl.replace('SEPARATOR', separator)
				.replace('EXTENSIONS', stringify(parser.extNames)) +
				'(' + parser.toString() + ')' +
				'(' + stringify(path) + ');\n';
			if (options.name && options.amd) {
				src = src.replace('(function', 'define("' + options.name +
					'", function () { return (function') + '});\n';
			} else if (options.name) {
				src = src.replace('(function', 'window.' + options.name + ' = (function');
			} else if (options.amd) {
				src = src.replace('(function', 'define(function () { return (function') + '});\n';
			}
			return options.output ?
					writeFile(resolve(String(options.output)), src)(parser) : src;
		});
	}).cb(cb);
	promise.time = now() - time;
	promise.parser = parser;
	return promise;
};
