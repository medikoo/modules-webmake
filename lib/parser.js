'use strict';

var commonLeft   = require('es5-ext/lib/Array/prototype/common-left')
  , compact      = require('es5-ext/lib/Array/prototype/compact')
  , copy         = require('es5-ext/lib/Array/prototype/copy')
  , last         = require('es5-ext/lib/Array/prototype/last')
  , CustomError  = require('es5-ext/lib/Error/custom')
  , d            = require('es5-ext/lib/Object/descriptor')
  , map          = require('es5-ext/lib/Object/map')
  , callable     = require('es5-ext/lib/Object/valid-callable')
  , validValue   = require('es5-ext/lib/Object/valid-value')
  , isString     = require('es5-ext/lib/String/is-string')
  , trimCommon   = require('es5-ext/lib/String/prototype/trim-common-left')
  , sLast        = require('es5-ext/lib/String/prototype/last')
  , indent       = require('es5-ext/lib/String/prototype/indent')
  , endsWith     = require('es5-ext/lib/String/prototype/ends-with')
  , deferred     = require('deferred')
  , memoize      = require('memoizee/lib/primitive')
  , stat         = require('fs').stat
  , path         = require('path')
  , nmSource     = process.binding('natives')
  , getRequire   = require('next/lib/module/get-require')
  , findRoot     = require('next/lib/module/find-package-root')
  , readFile     = require('fs2/lib/read-file').readFile
  , findRequires = require('find-requires')

  , isArray = Array.isArray, create = Object.create, keys = Object.keys
  , parse = JSON.parse, stringify = JSON.stringify
  , basename = path.basename, extname = path.extname, dirname = path.dirname
  , join = path.join, resolve = path.resolve, sep = path.sep
  , readFileOpts = { encoding: 'utf8' }
  , getThis = function () { return this; }
  , readFileData, readFileDataCached, parseDependencies
  , parser, modulesToString, dirEndMatch, statP, getExt
  , stripBOM, getMain;

if (sep == null) {
	throw new Error("Unsupported Node version. Please upgrade," +
		" Webmake needs at least Node v0.8");
}
dirEndMatch = new RegExp('(?:^|\\' + sep + ')\\.*$');

parseDependencies = function (text, filename, ignoreErrors) {
	var deps;
	try {
		deps = findRequires(text, { raw: true });
	} catch (e) {
		throw new CustomError(e.message + " in " + filename, 'AST_ERROR',
			{ origin: e });
	}
	return deps.map(function (node) {
		var path = node.value;
		if (!path) {
			if (!ignoreErrors) {
				throw new CustomError("Not parsable require call: `" + node.raw +
					"` at " + filename + ":" + node.line + "\n             You may" +
					" ignore such errors with ignoreErrors option ('ignore-errors'" +
					" when running from command line)", 'DYNAMIC_REQUIRE');
			}
			console.warn("Not parsable require call (ignored): `" + node.raw +
				"` at " + filename + ":" + node.line);
		}
		return path;
	});
};

statP = memoize(function (filename) {
	var def = deferred();
	stat(filename, function (err, stats) {
		if (err) def.reject(err);
		else def.resolve(stats);
	});
	return def.promise;
});

getMain = memoize(function (path) {
	return readFile(resolve(path, 'package.json'), readFileOpts)(
		function (content) {
			var main = parse(stripBOM(content)).main;
			if (!main) throw new Error("No main setting found");
			return main;
		}
	);
});

stripBOM = function (source) {
	if (source.charCodeAt(0) === 0xFEFF) {
		// Remove BOM, see:
		// https://github.com/joyent/node/blob/master/lib/module.js#L460
		// (...) This catches EF BB BF (the UTF-8 BOM)
		// because the buffer-to-string conversion in `fs.readFile()`
		// translates it to FEFF, the UTF-16 BOM. (...)
		source = source.slice(1);
	}
	return source;
};

readFileData = function (filename, parser, localFilename) {
	return readFile(filename, readFileOpts)(function (code) {
		var ext = extname(filename), type, sourceUrl, data;
		code = stripBOM(code);

		if ((ext !== '.js') && (ext !== '.json') && (ext !== '.css') &&
				(ext !== '.html')) {
			if (parser.ext['.js'].hasOwnProperty(ext)) type = '.js';
			else if (parser.ext['.json'].hasOwnProperty(ext)) type = '.json';
			else if (parser.ext['.css'].hasOwnProperty(ext)) type = '.css';
			else if (parser.ext['.html'].hasOwnProperty(ext)) type = '.html';

			if (!type) throw new Error("Unexpected extension");

			sourceUrl = localFilename.slice(0, -ext.length) + type;

			// Extension
			data = parser.ext[type][ext].compile(code, { filename: filename,
				localFilename: localFilename, sourceMap: parser.sourceMap,
				generatedFilename: sourceUrl });
			code = data.code;
			if (parser.sourceMap && data.sourceMap) {
				code += '//# sourceMappingURL=data:application/json;base64,' +
					new Buffer(data.sourceMap).toString('base64') + '\n';
			}
		} else {
			type = ext;
			sourceUrl = localFilename;
		}
		return deferred(code)(function (code) {
			var deps;
			if (type === '.json') {
				code = 'module.exports = ' + code.trim() + ';\n';
				deps = [];
			} else if (type === '.css') {
				code = 'require(\'webmake/lib/browser/load-css.js\')(' +
					stringify(code.trim()) + ');\n';
				deps = ['webmake/lib/browser/load-css.js'];
			} else if (type === '.html') {
				code = 'module.exports = ' + stringify(code) + ';\n';
				deps = [];
			} else {
				if (sLast.call(code) !== '\n') code += '\n';
				deps = compact.call(parseDependencies(code, filename,
					parser.ignoreErrors));
			}

			if (parser.sourceMap) {
				code = 'eval(' + stringify(code + '//# sourceURL=' +
					sourceUrl) + ');\n';
			}
			return { content: code, deps: deps };
		});
	});
};

readFileDataCached = (function () {
	var cache = {};
	return function (filename, parser, localFilename) {
		var data;
		if (!cache.hasOwnProperty(filename)) data = cache[filename] = {};
		else data = cache[filename];
		return statP(filename)(function (stats) {
			stats = stats.size + '.' + stats.mtime.valueOf();
			if (data.stats === stats) return data.data;
			data.stats = stats;
			return (data.data = readFileData(filename, parser, localFilename));
		});
	};
}());

modulesToString = function self(nest, parser) {
	var format = parser.prettyOutput ? indent : getThis;
	return keys(this).sort().map(function (name) {
		var current = this[name]
		  , text = format.call(stringify(name), '\t', nest + 1) + ': ';

		if (name === ':mainpath:') {
			// Package main instruction
			text += stringify(current);

		} else if (typeof current !== 'string') {
			// Folder
			text += '{\n' + self.call(current, nest + 1, parser) + '\n' +
				format.call('}', '\t', nest + 1);

		} else {
			// Module
			text += 'function (exports, module, require) {\n' +
				format.call(current, '\t', nest + 2) + format.call('}', '\t', nest + 1);
		}
		return text;
	}, this).join(',\n');
};

parser = {
	readInput: function (input) {
		var scope, path, tree = [];
		input = resolve(String(input));
		statP.clearAll();
		getMain.clearAll();
		return findRoot(input)(function (root) {
			var name, dirs, result;
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
			if (scope[name]) return scope[name];
			result = this.readFile(input, name, scope, tree);
			if (!scope[name]) scope[name] = result;
			return result;
		}.bind(this))(function () {
			return path.slice(0, -extname(path).length).replace(/\\/g, '/');
		});
	},
	readFile: function (filename, name, scope, tree) {
		// console.log("PC", filename);
		var read = this.cache ? readFileDataCached : readFileData;
		return read(filename, this,
			filename.split(sep).slice(-2 - tree.length).join('/'))(function (data) {
			this.modulesFiles.push(filename);
			scope[name] = data.content;
			return deferred.map(data.deps,
				this.resolve.bind(this, filename, dirname(filename), scope, tree))
				.aside(function (p) { this.depsMap[filename] = p; }.bind(this));
		}.bind(this));
	},
	resolve: function (fromfile, dirname, scope, tree, filename) {
		// console.log("R", filename);
		tree = copy.call(tree);
		if (filename[0] === '.') {
			return this.resolveLocal(fromfile, dirname, scope, tree, filename);
		}
		return this.resolveExternal(fromfile, dirname, filename);
	},
	resolveLocal: function (fromfile, dirpath, scope, tree, filename, orgFn) {
		// console.log("RL", filename, dirpath, fromfile, tree.length);
		var resolveDirPath, resolvePath, resolveFirstTypePath, resolveExtTypePath
		  , resolveSpecificPath, init, extNames = this.extNames;

		if (!orgFn) orgFn = filename;

		resolveDirPath = function (path) {
			return getMain(path)(function (main) {
				return resolvePath(resolve(path, main), true);
			}, function (err) {
				return resolveFirstTypePath(resolve(path, 'index'));
			});
		};

		resolveFirstTypePath = function (path) {
			return resolveSpecificPath(path, '.js')(null, function () {
				return resolveSpecificPath(path, '.json')(null, function () {
					return resolveSpecificPath(path, '.css')(null, function () {
						return resolveSpecificPath(path, '.html');
					});
				});
			});
		};

		resolveSpecificPath = function (path, ext) {
			return statP(path + ext)(function (stats) {
				if (stats.isFile()) return path + ext;
				throw new Error("Not Found");
			})(null, function () { return resolveExtTypePath(path, ext); });
		};

		resolveExtTypePath = function (path, ext) {
			var exts = extNames[ext];
			if (!exts.length) {
				throw new Error("Module '" + orgFn + "' not found, as required in '" +
					fromfile + "'");
			}
			return deferred.some(exts, function (ext) {
				return statP(path + ext)(function (stats) {
					if (stats.isFile()) {
						path += ext;
						return true;
					}
					return false;
				}, false);
			})(function (found) {
				if (!found) {
					throw new Error("Module '" + orgFn +
						"' not found, as required in '" + fromfile + "'");
				}
				return path;
			});
		};

		resolvePath = (function () {
			var resolvePath = function (path, forceIndex) {
				return resolveFirstTypePath(path)(null, function (err) {
					return statP(path)(function (stats) {
						if (stats.isDirectory()) {
							if (forceIndex) {
								return resolveFirstTypePath(resolve(path, 'index'));
							}
							return resolveDirPath(path);
						}
						throw err;
					}, function () { throw err; });
				});
			};
			return function (path, forceIndex) {
				var ext = extname(path).toLowerCase();
				if ((ext === '.js') || (ext === '.json') || (ext === '.css') ||
						(ext === '.html')) {
					return resolveSpecificPath(path.slice(0, -ext.length), ext)(null,
						function (err) { return resolvePath(path, forceIndex); });
				}
				return resolvePath(path, forceIndex);
			};
		}());

		init = dirEndMatch.test(filename) ? resolveDirPath : resolvePath;
		return init(resolve(dirpath, filename))(function (filename) {
			var dir, tokens, index, result
			  , name = basename(filename), path = dirname(filename);

			if (path !== dirpath) {
				index = commonLeft.call(dirpath, path);
				if (!index) throw new Error("Require out of package root scope");

				// Adjust to partial path match cases (e.g. /foo/sub-one and /foo/sub)
				if (path.length !== index) {
					if (dirpath.length === index) {
						if (path[index] !== sep) {
							index = path.slice(0, index).lastIndexOf(sep) + 1;
						}
					} else if (path[index - 1] !== sep) {
						index = path.slice(0, index - 1).lastIndexOf(sep) + 1;
					}
				} else if (dirpath[index] !== sep) {
					index = dirpath.slice(0, index).lastIndexOf(sep) + 1;
				}

				if (!path[index] || !dirpath[index]) index += 1;

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
			if (scope[name]) return filename;
			result = this.readFile(filename, name, scope, tree);
			if (!scope[name]) scope[name] = result;
			return result(filename);
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

			if (name === 'webmake') {
				this.packages.webmake = resolve(__dirname, '../');
				return (this.modules.webmake = {});
			}
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
				} catch (ignore) {}
				nmSource[name] = cache;
				if (main === name) {
					// No substitute found
					if (!this.ignoreErrors) {
						throw new Error("Cannot require " + stringify(name) +
							" (as in '" + fromfile + "').\n       Native node.js modules" +
							" are not ported to client-side. You can however provide" +
							" an alternative version of this module in your node_modules" +
							" path, it will be picked up by Webmake.\n");
					}
					console.warn("Require of native " + stringify(name) +
						" approached (ignored)");
					return;
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
				}
				if (endsWith.call(path, filename)) {
					this.packages[name] = path.slice(0, name.length - filename.length);
					return (this.modules[name] = {});
				}
			}
			// Use dedicated findRoot
			var promise = this.modules[name] = findRoot(path)(function (root) {
				var module = {};
				this.packages[name] = root;
				return getMain(root)(function (main) {
					module[':mainpath:'] = main;
					return module;
				}, module);
			}.bind(this));
			promise.aside(function (module) {
				this.modules[name] = module;
			}.bind(this));
			return promise;

		}.bind(this))()(function (scope) {
			// console.log('RFT', name, this.modules[name] === scope);
			if (!scope) return;
			tree = [];
			if (name === filename) filename = scope[':mainpath:'] || 'index';
			else filename = filename.slice(name.length + 1);
			// console.log("RE", name, scope, filename);
			return this.resolveLocal(fromfile, this.packages[name], scope, tree,
				filename, org);
		}.bind(this));
	},
	toString: function () {
		var str = '';
		if (this.useStrict) {
			str += '(function () { \'use strict\'; return ';
		}
		str += '{\n' + modulesToString.call(this.modules, 0, this) + '\n}';
		if (this.useStrict) {
			str += '; }())';
		}
		return str;
	}
};

getExt = function (ext) {
	var type, name;
	if (isString(ext)) {
		name = String(ext);
		try {
			ext = require('webmake-' + name);
		} catch (e) {
			if (e.code !== 'MODULE_NOT_FOUND') throw e;
			throw new CustomError("Extension '" + name + "' not found. Make sure" +
				" you have package 'webmake-" + name + "' installed.",
				'EXTENSION_NOT_INSTALLED');
		}
	} else {
		name = ext.name;
	}
	validValue(ext.extension);
	callable(ext.compile);
	type = '.' + (ext.type || 'js');
	if (!this.hasOwnProperty(type)) {
		throw new CustomError("Extension '" + (name || ext.extension) +
			"' configured for unknown type '" + type + "'");
	}
	if (isArray(ext.extension)) {
		ext.extension.forEach(function (name) {
			this[type]['.' + String(name)] = ext;
		}, this);
	} else {
		this[type]['.' + String(ext.extension)] = ext;
	}
};

module.exports = exports = function (/* options */) {
	var options = Object(arguments[0])
	  , ext = { '.js': {}, '.json': {}, '.css': {}, '.html': {} };
	if (options.ext) {
		if (isArray(options.ext)) {
			options.ext.forEach(getExt, ext);
		} else {
			getExt.call(ext, options.ext);
		}
	}
	return create(parser, {
		modules: d({}),
		packages: d({}),
		modulesFiles: d([]),
		useStrict: d(Boolean(options.useStrict)),
		sourceMap: d(Boolean(options.sourceMap)),
		ignoreErrors: d(Boolean(options.ignoreErrors)),
		prettyOutput: d((options.prettyOutput == null) ? true :
				Boolean(options.prettyOutput)),
		cache: d(Boolean(options.cache)),
		ext: d(ext),
		extNames: d(map(ext, function (value) { return keys(value); })),
		depsMap: d({})
	});
};
exports.modulesToString = modulesToString;
