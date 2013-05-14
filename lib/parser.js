'use strict';

var copy         = require('es5-ext/lib/Array/prototype/copy')
  , last         = require('es5-ext/lib/Array/prototype/last')
  , isString     = require('es5-ext/lib/String/is-string')
  , trimCommon   = require('es5-ext/lib/String/prototype/trim-common-left')
  , sLast        = require('es5-ext/lib/String/prototype/last')
  , d            = require('es5-ext/lib/Object/descriptor')
  , indent       = require('es5-ext/lib/String/prototype/indent')
  , endsWith     = require('es5-ext/lib/String/prototype/ends-with')
  , deferred     = require('deferred')
  , path         = require('path')
  , stat         = require('fs').stat
  , nmSource     = process.binding('natives')
  , getRequire   = require('next/lib/module/get-require')
  , findRoot     = require('next/lib/module/find-package-root')
  , readFile     = require('fs2/lib/read-file').readFile
  , statP        = require('fs2/lib/stat').stat
  , findRequires = require('find-requires')

  , create = Object.create, keys = Object.keys, stringify = JSON.stringify
  , dirname = path.dirname, join = path.join, resolve = path.resolve
  , sep = path.sep
  , readFileOpts = { encoding: 'utf8' }
  , dotMatch = /^\.+$/
  , readCachedFile, fileExists, dirExists, parseDependencies, parser
  , modulesToString;

if (sep == null) {
	throw new Error("Unsupported Node version. Please upgrade," +
		" Webmake needs at least Node v0.8");
}

fileExists = function (path) {
	var def = deferred();
	stat(path, function (err, stats) {
		def.resolve(err ? false : stats.isFile());
	});
	return def.promise;
};

dirExists = function (path) {
	var def = deferred();
	stat(path, function (err, stats) {
		def.resolve(err ? false : stats.isDirectory());
	});
	return def.promise;
};

parseDependencies = function (text, filename) {
	return findRequires(text, { raw: true }).map(function (node) {
		var path = node.value;
		if (!path) {
			throw new TypeError("Not supported require call: " + node.raw +
				" at " + filename + ":" + node.line);
		}
		return (path.slice(-3) === '.js') ? path.slice(0, -3) : path;
	});
};

readCachedFile = (function () {
	var cache = {};
	return function (path) {
		var data;
		if (!cache.hasOwnProperty(path)) data = cache[path] = {};
		else data = cache[path];
		return statP(path)(function (stats) {
			stats = stats.size + '.' + stats.mtime.valueOf();
			if (data.stats === stats) return data.file;
			data.stats = stats;
			return (data.file = readFile(path, readFileOpts));
		});
	};
}());

modulesToString = function self(nest, options) {
	return keys(this).sort().map(function (name) {
		var current = this[name]
		  , text = indent.call(stringify(name), '\t', nest + 1) + ': ';
		if (name === ':mainpath:') {
			text += stringify(current);
		} else if (!isString(current)) {
			text += '{\n' + self.call(current, nest + 1, options) + '\n' +
				indent.call('}', '\t', nest + 1);
		} else {
			text += 'function (exports, module, require) {\n' +
				indent.call(options.sourceMap ?
						'eval(' + stringify(current + '\n//@ sourceURL=' +
							current.filename) +
						')' : current, '\t', nest + 2) +
				indent.call('}', '\t', nest + 1);
		}
		return text;
	}, this).join(',\n');
};

parser = {
	readInput: function (input) {
		var scope, path, tree = [];
		input = resolve(String(input));
		return findRoot(input)(function (root) {
			var name, dirs;
			name = root ? last.call(root.split(sep)) : '/';
			if (!this.modules[name]) {
				this.packages[name] = root || sep;
				this.modules[name] = {};
			}
			scope = this.modules[name];
			path = name + (root ? sep : '') +
				(dirs = trimCommon.call(input, root || '').slice(1));
			dirs = dirs.split(sep);
			name = dirs.pop();
			dirs.forEach(function (dir) {
				tree.push(scope);
				scope = scope[dir] || (scope[dir] = {});
			});
			return this.readFile(input, name, scope, tree);
		}.bind(this))(function () {
			return path.slice(0, -3).replace(/\\/g, '/');
		});
	},
	readFile: function (filename, name, scope, tree) {
		// console.log("PC", filename);
		return readCachedFile(filename)(function (content) {
			this.modulesFiles.push(filename);
			if (content.charCodeAt(0) === 0xFEFF) {
				// Remove BOM, see:
				// https://github.com/joyent/node/blob/master/lib/module.js#L448
				// (...) This catches EF BB BF (the UTF-8 BOM)
				// because the buffer-to-string conversion in `fs.readFile()`
				// translates it to FEFF, the UTF-16 BOM. (...)
				content = content.slice(1);
			}
			if (sLast.call(content) !== '\n') {
				content += '\n';
			}
			scope[name] = content = new String(content);
			content.filename = filename.split(sep)
				.slice(-2 - tree.length).join('/');
			return deferred.map(parseDependencies(content, filename),
				this.resolve.bind(this, filename, dirname(filename), scope, tree));
		}.bind(this));
	},
	resolve: function (fromfile, dirname, scope, tree, filename) {
		// console.log("R", filename);
		tree = copy.call(tree);
		if (filename[0] === '.') {
			return this.resolveLocal(fromfile, dirname, scope, tree, filename);
		} else {
			return this.resolveExternal(fromfile, dirname, filename);
		}
	},
	resolveLocal: function (fromfile, dirname, scope, tree, filename) {
		// console.log("RL", filename, dirname, fromfile, tree.length);
		var path, dir, name, isDir;
		filename = join(filename);
		path = filename.split(sep);
		if (dotMatch.test(last.call(path))) {
			// If path ends with '/..' or '/.' we end it with sep: '/../'
			// (it will indicate that we're after directory's index.js)
			path.push('');
			filename += sep;
		}
		isDir = (sLast.call(filename) === sep);
		filename = resolve(dirname + sep + filename);
		return (isDir ? dirExists(filename)(function (exists) {
			if (exists) {
				path.pop();
				name = 'index.js';
				filename += sep + 'index.js';
			} else {
				throw new Error("Module '" + filename +
					"' not found, as required in '" + fromfile + "'");
			}
		}) : fileExists(filename + '.js')(function (exists) {
			if (exists) {
				filename += '.js';
				name = path.pop() + '.js';
			} else {
				return dirExists(filename)(function (exists) {
					if (exists) {
						name = 'index.js';
						filename += sep + 'index.js';
					} else {
						throw new Error("Module '" + filename +
							"' not found, as required in '" + fromfile + "'");
					}
				});
			}
		}))(function () {
			while ((dir = path.shift())) {
				if (dir === '..') {
					if (!tree.length) {
						throw new Error("Require out of package root scope");
					}
					scope = tree.pop();
				} else if (dir !== '.') {
					tree.push(scope);
					scope = scope[dir] || (scope[dir] = {});
				}
			}
			if (scope[name]) {
				return null;
			} else {
				return (scope[name] = this.readFile(filename, name, scope, tree));
			}
		}.bind(this));
	},
	resolveExternal: function (fromfile, dirname, filename) {
		// console.log("RE", filename);
		var org = filename, name, tree, require, main, path, cache;
		filename = join(filename);
		name = filename.split(sep, 1)[0];
		return deferred.promisifySync(function () {
			if (this.modules[name]) {
				return this.modules[name];
			} else {
				require = getRequire(fromfile);
				try {
					path = main = require.resolve(name);
				} catch (e) {
					try {
						path = require.resolve(org);
					} catch (e2) {
						throw new Error("Module '" + filename +
							"' not found, as required in '" + fromfile + "'");
					}
				}
				if (main === name) {
					cache = nmSource[name];
					delete nmSource[name];
					try {
						path = main = require.resolve(name);
					} catch (e3) {}
					nmSource[name] = cache;
					if (main === name) {
						throw new Error("Cannot require " + stringify(name) +
							" (as in '" + fromfile + "').\n       Native node.js modules" +
							" are not ported to client-side. You can however provide" +
							" alternative version of this module in your node_modules" +
							" path, it will be picked up by Webmake.\n");
					}
				}
				if (!main && endsWith.call(path, filename + '.js')) {
					this.packages[name] = path.slice(0, -(filename.length + 3) +
						name.length);
					return (this.modules[name] = {});
				}
				var promise = this.modules[name] = findRoot(path)(function (root) {
					var module = {};
					this.packages[name] = root;
					if (main) {
						module[':mainpath:'] = trimCommon.call(main, root).slice(1, -3);
					}
					return module;
				}.bind(this));
				promise.aside(function (module) {
					this.modules[name] = module;
				}.bind(this));
				return promise;
			}
		}.bind(this))()(function (scope) {
			// console.log('RFT', name, this.modules[name] === scope);
			tree = [];
			if (name === filename) {
				filename = scope[':mainpath:'];
			} else {
				filename = filename.slice(name.length + 1);
			}
			// console.log("RE", name, scope, filename);
			return this.resolveLocal(fromfile, this.packages[name], scope, tree,
				filename);
		}.bind(this));
	},
	toString: function (options) {
		return '{\n' + modulesToString.call(this.modules, 0, options) + '\n}';
	}
};

module.exports = exports = function () {
	return create(parser, {
		modules: d({}),
		packages: d({}),
		modulesFiles: d([])
	});
};
exports.modulesToString = modulesToString;
