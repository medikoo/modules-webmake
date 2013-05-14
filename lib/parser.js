'use strict';

var commonLeft   = require('es5-ext/lib/Array/prototype/common-left')
  , copy         = require('es5-ext/lib/Array/prototype/copy')
  , last         = require('es5-ext/lib/Array/prototype/last')
  , isString     = require('es5-ext/lib/String/is-string')
  , trimCommon   = require('es5-ext/lib/String/prototype/trim-common-left')
  , sLast        = require('es5-ext/lib/String/prototype/last')
  , d            = require('es5-ext/lib/Object/descriptor')
  , indent       = require('es5-ext/lib/String/prototype/indent')
  , endsWith     = require('es5-ext/lib/String/prototype/ends-with')
  , deferred     = require('deferred')
  , stat         = require('fs').stat
  , path         = require('path')
  , nmSource     = process.binding('natives')
  , getRequire   = require('next/lib/module/get-require')
  , findRoot     = require('next/lib/module/find-package-root')
  , readFile     = require('fs2/lib/read-file').readFile
  , findRequires = require('find-requires')

  , create = Object.create, keys = Object.keys
  , parse = JSON.parse, stringify = JSON.stringify
  , basename = path.basename, extname = path.extname, dirname = path.dirname
  , join = path.join, resolve = path.resolve, sep = path.sep
  , readFileOpts = { encoding: 'utf8' }
  , readFileData, readFileDataCached, parseDependencies
  , parser, modulesToString, dirEndMatch, statP, statsCache;

if (sep == null) {
	throw new Error("Unsupported Node version. Please upgrade," +
		" Webmake needs at least Node v0.8");
}
dirEndMatch = new RegExp('(?:^|\\' + sep + ')\\.*$');

parseDependencies = function (text, filename) {
	return findRequires(text, { raw: true }).map(function (node) {
		var path = node.value;
		if (!path) {
			throw new TypeError("Not supported require call: " + node.raw +
				" at " + filename + ":" + node.line);
		}
		return path;
	});
};

statP = function (filename) {
	var def;
	if (statsCache.hasOwnProperty(filename)) return statsCache[filename];
	def = deferred();
	stat(filename, function (err, stats) {
		if (err) def.reject(err);
		else def.resolve(stats);
	});
	return (statsCache[filename] = def.promise);
};

readFileData = function (filename) {
	return readFile(filename, readFileOpts)(function (content) {
		if (content.charCodeAt(0) === 0xFEFF) {
			// Remove BOM, see:
			// https://github.com/joyent/node/blob/master/lib/module.js#L460
			// (...) This catches EF BB BF (the UTF-8 BOM)
			// because the buffer-to-string conversion in `fs.readFile()`
			// translates it to FEFF, the UTF-16 BOM. (...)
			content = content.slice(1);
		}
		return { content: content, deps: parseDependencies(content, filename) };
	});
};

readFileDataCached = (function () {
	var cache = {};
	return function (filename) {
		var data;
		if (!cache.hasOwnProperty(filename)) data = cache[filename] = {};
		else data = cache[filename];
		return statP(filename)(function (stats) {
			stats = stats.size + '.' + stats.mtime.valueOf();
			if (data.stats === stats) return data.data;
			data.stats = stats;
			return (data.data = readFileData(filename));
		});
	};
}());

modulesToString = function self(nest, parser) {
	return keys(this).sort().map(function (name) {
		var ext, current = this[name]
		  , text = indent.call(stringify(name), '\t', nest + 1) + ': ';

		if (name === ':mainpath:') {
			// Package main instruction
			text += stringify(current);

		} else if (!isString(current)) {
			// Folder
			text += '{\n' + self.call(current, nest + 1, parser) + '\n' +
				indent.call('}', '\t', nest + 1);

		} else {
			// Module
			ext = extname(name).toLowerCase();

			if (ext === '.js') {
				// JavaScript
				if (parser.sourceMaps) {
					current = 'eval(' + stringify(current + '\n//@ sourceURL=' +
						current.filename) + ')';
				}

			} else if (ext === '.json') {
				// JSON
				current = 'module.exports = ' + current.trim() + ';';
			}

			if (sLast.call(current) !== '\n') current += '\n';
			text += 'function (exports, module, require) {\n' +
				indent.call(current, '\t', nest + 2) + indent.call('}', '\t', nest + 1);
		}
		return text;
	}, this).join(',\n');
};

parser = {
	readInput: function (input) {
		var scope, path, tree = [];
		input = resolve(String(input));
		statsCache = {};
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
		var read = this.cache ? readFileDataCached : readFileData;
		return read(filename, readFileOpts)(function (data) {
			var content;
			this.modulesFiles.push(filename);
			scope[name] = content = new String(data.content);
			content.filename = filename.split(sep)
				.slice(-2 - tree.length).join('/');
			return deferred.map(data.deps,
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
	resolveLocal: function (fromfile, dirpath, scope, tree, filename, orgFn) {
		// console.log("RL", filename, dirpath, fromfile, tree.length);
		var getDirModulePath, getDirIndexModule, getModulePath, getAltModulePath
		  , init;

		if (!orgFn) orgFn = filename;

		getDirIndexModule = function (path) {
			path = resolve(path, 'index.js');
			return statP(path)(function (stats) {
				if (!stats.isFile()) throw new Error("Not found");
			})(path, function () {
				throw new Error("Module '" + orgFn +
					"' not found, as required in '" + fromfile + "'");
			});
		};

		getDirModulePath = function (path) {
			return readFile(resolve(path, 'package.json'), readFileOpts)(
				function (content) {
					var main = parse(content).main;
					if (main) return getModulePath(resolve(path, main), true);
					return getDirIndexModule(path);
				},
				function (err) { return getDirIndexModule(path); }
			);
		};

		getAltModulePath = function (path) {
			return statP(path + '.js')(function (stats) {
				if (stats.isFile()) return path + '.js';
				throw new Error("Not Found");
			})(null, function () {
				return statP(path + '.json')(function (stats) {
					if (stats.isFile()) return path + '.json';
					throw new Error("Not Found");
				})(null, function () {
					throw new Error("Module '" + orgFn +
						"' not found, as required in '" + fromfile + "'");
				});
			});
		};

		getModulePath = function (path, forceIndex) {
			var ext = extname(path).toLowerCase();
			if ((ext === '.js') || (ext === '.json')) {
				return statP(path)(function (stats) {
					if (stats.isFile()) return path;
					return getAltModulePath(path)(null, function (err) {
						if (stats.isDirectory()) {
							return (forceIndex ? getDirIndexModule : getDirModulePath)(path);
						}
						throw err;
					});
				}, function () { return getAltModulePath(path); });
			}
			return getAltModulePath(path)(null, function (err) {
				return statP(path)(function (stats) {
					if (stats.isDirectory()) {
						return (forceIndex ? getDirIndexModule : getDirModulePath)(path);
					}
					throw err;
				}, function () { throw err; });
			});
		};

		init = dirEndMatch.test(filename) ? getDirModulePath : getModulePath;
		return init(resolve(dirpath, filename))(function (filename) {
			var dir, tokens, index, result
			  , name = basename(filename), path = dirname(filename);

			if (path !== dirpath) {
				index = commonLeft.call(dirpath, path);
				if (!index) throw new Error("Require out of package root scope");

				if (!path[index] || !dirpath[index]) {
					index += 1;
				} else if (dirpath[index - 1] !== sep) {
					index = dirpath.slice(0, index).lastIndexOf(sep) + 1;
				}

				dirpath = dirpath.slice(index);
				path = path.slice(index);

				if (dirpath) {
					tokens = dirpath.split(sep);
					if (tokens.length > tree.length) {
						throw new Error("Require out of package root scope");
					}
					while (tokens.pop()) scope = tree.pop();
				}
				if (path) {
					tokens = path.split(sep);
					while ((dir = tokens.shift())) {
						tree.push(scope);
						scope = scope[dir] || (scope[dir] = {});
					}
				}
			}
			if (scope[name]) return null;
			result = this.readFile(filename, name, scope, tree);
			if (!scope[name]) scope[name] = result;
			return result;
		}.bind(this));
	},
	resolveExternal: function (fromfile, dirname, filename) {
		// console.log("RE", filename);
		var org = filename, name, tree, require, main, path, cache, ext;
		filename = join(filename);
		name = filename.split(sep, 1)[0];
		return deferred.promisifySync(function () {
			// If already processed, return result
			if (this.modules[name]) return this.modules[name];

			// Find path to package with Node.js internal functions
			require = getRequire(fromfile);
			try {
				path = main = require.resolve(name);
			} catch (e) {
				// No main module for the package, try full require path
				try {
					path = require.resolve(org);
				} catch (e2) {
					throw new Error("Module '" + filename +
						"' not found, as required in '" + fromfile + "'");
				}
			}
			if (main === name) {
				// Require of Node.js native package.
				// Hack Node.js internals to get path to substitite
				// eventually provided in node_modules
				cache = nmSource[name];
				delete nmSource[name];
				try {
					path = main = require.resolve(name);
				} catch (e3) {}
				nmSource[name] = cache;
				if (main === name) {
					// No substitute found
					throw new Error("Cannot require " + stringify(name) +
						" (as in '" + fromfile + "').\n       Native node.js modules" +
						" are not ported to client-side. You can however provide" +
						" an alternative version of this module in your node_modules" +
						" path, it will be picked up by Webmake.\n");
				}
			}

			// Find package root
			if (!main) {
				// Try to calculate root by string subtraction
				ext = extname(path);
				if (endsWith.call(path, filename + ext)) {
					this.packages[name] =
						path.slice(0, name.length - (filename.length + ext.length));
					return (this.modules[name] = {});
				} else if (endsWith.call(path, filename)) {
					this.packages[name] = path.slice(0, name.length - filename.length);
					return (this.modules[name] = {});
				}
			}
			// Use dedicated findRoot
			var promise = this.modules[name] = findRoot(path)(function (root) {
				var module = {};
				this.packages[name] = root;
				if (main) module[':mainpath:'] = trimCommon.call(main, root).slice(1);
				return module;
			}.bind(this));
			promise.aside(function (module) {
				this.modules[name] = module;
			}.bind(this));
			return promise;

		}.bind(this))()(function (scope) {
			// console.log('RFT', name, this.modules[name] === scope);
			tree = [];
			if (name === filename) filename = scope[':mainpath:'];
			else filename = filename.slice(name.length + 1);
			// console.log("RE", name, scope, filename);
			return this.resolveLocal(fromfile, this.packages[name], scope, tree,
				filename, org);
		}.bind(this));
	},
	toString: function () {
		return '{\n' + modulesToString.call(this.modules, 0, this) + '\n}';
	}
};

module.exports = exports = function (/* options */) {
	var options = Object(arguments[0]);
	return create(parser, {
		modules: d({}),
		packages: d({}),
		modulesFiles: d([]),
		sourceMaps: d(Boolean(options.sourceMap)),
		cache: d(Boolean(options.cache))
	});
};
exports.modulesToString = modulesToString;
