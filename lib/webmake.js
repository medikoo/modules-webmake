'use strict';

var isArray      = Array.isArray
  , stringify    = JSON.stringify
  , fs           = require('fs')
  , resolve      = require('path').resolve
  , invoke       = require('es5-ext/lib/Function/invoke')
  , isFunction   = require('es5-ext/lib/Function/is-function')
  , lock         = require('es5-ext/lib/Function/prototype/lock')
  , count        = require('es5-ext/lib/Object/count')
  , deferred     = require('deferred')
  , filesAtPath  = deferred.promisify(require('next/lib/fs/files-at-path'))
  , createParser = require('./parser')

  , readFile = deferred.promisify(fs.readFile)
  , writeFile = deferred.promisify(fs.writeFile)
  , separator = (process.env.OS === 'Windows_NT') ? '/[\\\\/]/' : '\'/\''

  , templatePath;

templatePath = __dirname + '/webmake.tpl';

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
