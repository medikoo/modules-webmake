'use strict';

var aFrom        = require('es5-ext/array/from')
  , last         = require('es5-ext/array/#/last')
  , customError  = require('es5-ext/error/custom')
  , map          = require('es5-ext/object/map')
  , callable     = require('es5-ext/object/valid-callable')
  , validValue   = require('es5-ext/object/valid-value')
  , isString     = require('es5-ext/string/is-string')
  , sLast        = require('es5-ext/string/#/last')
  , indent       = require('es5-ext/string/#/indent')
  , endsWith     = require('es5-ext/string/#/ends-with')
  , d            = require('d')
  , deferred     = require('deferred')
  , memoize      = require('memoizee/plain')
  , stat         = require('fs').stat
  , path         = require('path')
  , commonPath   = require('path2/common')
  , nmSource     = process.binding('natives')
  , getRequire   = require('next/module/get-require')
  , findRoot     = require('next/module/find-package-root')
  , readFile     = require('fs2/read-file').readFile
  , findRequires = require('find-requires')

  , isArray = Array.isArray, create = Object.create, keys = Object.keys
  , parse = JSON.parse, stringify = JSON.stringify
  , basename = path.basename, extname = path.extname, dirname = path.dirname
  , join = path.join, resolve = path.resolve, sep = path.sep
  , readFileOpts = { encoding: 'utf8' }
  , getThis = function () { return this; }
  , sheBangRe = /^(#![\0-\t\u000b-\uffff]*)\n/
  , readFileData, readFileDataCached, parseDependencies, readFileContent
  , parser, modulesToString, dirEndMatch, statP, getExt
  , stripBOM, getMain, cssDeps, isOptional;

if (sep == null) {
	throw new Error("Unsupported Node version. Please upgrade," +
		" Webmake needs at least Node v0.8");
}
dirEndMatch = new RegExp('(?:^|\\' + sep + ')\\.*$');

cssDeps = [{
	value: 'webmake/lib/browser/load-css.js',
	raw: '\'webmake/lib/browser/load-css.js\'',
	point: 0,
	line: 0,
	column: 0
}];

isOptional = (function () {
	var pre = /try\s*\{(?:\s*[a-zA-Z][0-9a-zA-Z]*\s*=)?\s*require\(\s*$/
	  , post = new RegExp('^\\);?\\s*(?:\\/\\/[\\0-\\x09\\x0b\\x0c\\x0e-' +
		'\\u2027\\u2030-\\uffff]*[\\r\\n\\u2028\\u2029]\\s*)?\\}\\s*catch\\s*\\(');
	return function (src, point, pathLength) {
		return pre.test(src.slice(0, point - 1)) && post.test(src.slice(point + pathLength - 1));
	};
}());

parseDependencies = function (text, filename, ignoreErrors) {
	var deps;
	try {
		deps = findRequires(text, { raw: true });
	} catch (e) {
		throw customError(e.message + " in " + filename, 'AST_ERROR', { origin: e });
	}
	return deps.filter(function (node) {
		if (node.value != null) return true;
		if (!ignoreErrors) {
			throw customError("Not parsable require call: `" + node.raw +
				"` at " + filename + ":" + node.line + "\n             You may" +
				" ignore such errors with ignoreErrors option ('ignore-errors'" +
				" when running from command line)", 'DYNAMIC_REQUIRE');
		}
		console.warn("Not parsable require call (ignored): `" + node.raw +
			"` at " + filename + ":" + node.line);
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

readFileContent = function (code, filename, parser, localFilename) {
	var ext = extname(filename), type, sourceUrl, data;

	if ((ext !== '.js') && (ext !== '.json') && (ext !== '.css') && (ext !== '.html')) {
		if (parser.ext['.js'].hasOwnProperty(ext)) type = '.js';
		else if (parser.ext['.json'].hasOwnProperty(ext)) type = '.json';
		else if (parser.ext['.css'].hasOwnProperty(ext)) type = '.css';
		else if (parser.ext['.html'].hasOwnProperty(ext)) type = '.html';

		if (!type) throw new Error("Unexpected extension");

		sourceUrl = localFilename.slice(0, -ext.length) + type;

		// Extension
		if (parser.transform) {
			code = deferred(parser.transform(filename, code))(function (code) {
				var data;
				if (code == null) {
					throw customError("Provided transform callback must return code string",
						'INVALID_TRANSFORM');
				}
				code = String(code);
				data = parser.ext[type][ext].compile(code, { filename: filename,
					localFilename: localFilename, sourceMap: parser.sourceMap,
					generatedFilename: sourceUrl });
				code = data.code;
				if (parser.sourceMap && data.sourceMap) {
					code += '//# sourceMappingURL=data:application/json;base64,' +
						new Buffer(data.sourceMap).toString('base64') + '\n';
				}
				return code;
			});
		} else {
			data = parser.ext[type][ext].compile(code, { filename: filename,
				localFilename: localFilename, sourceMap: parser.sourceMap,
				generatedFilename: sourceUrl });
			code = data.code;
			if (parser.sourceMap && data.sourceMap) {
				code += '//# sourceMappingURL=data:application/json;base64,' +
					new Buffer(data.sourceMap).toString('base64') + '\n';
			}
		}
	} else {
		type = ext;
		sourceUrl = localFilename;
		if (parser.transform) {
			code = deferred(parser.transform(filename, code))(function (data) {
				var code;
				if (data == null) {
					throw customError("Provided transform callback must return code string",
						'INVALID_TRANSFORM');
				}
				code = (data.code === undefined) ? data : data.code;
				if (ext !== '.js') code = String(code);
				else code = stripBOM(String(code)).replace(sheBangRe, '//$1\n');
				if (parser.sourceMap && data.sourceMap) {
					code += '//# sourceMappingURL=data:application/json;base64,' +
						new Buffer(data.sourceMap).toString('base64') + '\n';
				}
				return code;
			});
		} else if (ext === '.js') {
			code = stripBOM(code).replace(sheBangRe, '//$1\n');
		}
	}
	return deferred(code)(function (code) {
		var deps;
		code = String(code);
		if (type === '.json') {
			code = 'module.exports = ' + code.trim() + ';\n';
			deps = [];
		} else if (type === '.css') {
			code = 'require(\'webmake/lib/browser/load-css.js\')(' + stringify(code.trim()) + ');\n';
			deps = cssDeps;
		} else if (type === '.html') {
			code = 'module.exports = ' + stringify(code) + ';\n';
			deps = [];
		} else {
			if (sLast.call(code) !== '\n') code += '\n';
			deps = parseDependencies(code, filename, parser.ignoreErrors);
		}

		if (parser.sourceMap) {
			code = 'eval(' + stringify(code + '//# sourceURL=' + sourceUrl) + ');\n';
		}
		return { content: code, deps: deps };
	});
};

readFileData = function (filename, parser, localFilename) {
	return readFile(filename, readFileOpts)(function (code) {
		return readFileContent(code, filename, parser, localFilename);
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
	readInput: function (input/*, options*/) {
		var scope, path, tree = [], options = Object(arguments[1]), stream = options.stream
		  , content, def;
		input = resolve(String(input));
		statP.clear();
		getMain.clear();
		if (stream) {
			def = deferred();
			content = '';
			stream.on('data', function (data) { content += data; });
			stream.on('error', def.reject);
			stream.on('end', function () { def.resolve(content); });
		}
		return findRoot(input)(function (root) {
			var name, dirs, result;
			name = root ? last.call(root.split(sep)) : '/';
			if (!this.modules[name]) {
				this.packages[name] = root || sep;
				this.modules[name] = {};
			}
			scope = this.modules[name];
			dirs = root ? input.slice(root.length + 1) : input.slice(1);
			path = name + (root ? sep : '') + dirs;
			dirs = dirs.split(sep);
			name = dirs.pop();
			dirs.forEach(function (dir) {
				tree.push(scope);
				scope = scope[dir] || (scope[dir] = {});
			});
			if (scope[name]) return scope[name];
			if (!stream) {
				result = this.readFile(input, name, scope, tree);
				if (!scope[name]) scope[name] = result;
				return result;
			}
			return def.promise(function (content) {
				return readFileContent(content, name, this, name)(function (data) {
					scope[name] = data.content;
					return deferred.map(data.deps, this.resolve.bind(this, input, dirname(input), scope, []));
				}.bind(this));
			}.bind(this));
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
	resolve: function (fromfile, dirname, scope, tree, dep) {
		// console.log("R", dep.value);
		tree = aFrom(tree);
		if (dep.value[0] === '.') return this.resolveLocal(fromfile, dirname, scope, tree, dep);
		return this.resolveExternal(fromfile, dirname, scope, dep);
	},
	resolveLocal: function (fromfile, dirpath, scope, tree, dep, orgFn, lScope) {
		var filename = dep.localFilename || dep.value, extNames = this.extNames
		  , resolveDirPath, resolvePath, resolveFirstTypePath, resolveExtTypePath
		  , resolveSpecificPath, init;
		// console.log("RL", filename, dirpath, fromfile, tree.length);

		if (!lScope) lScope = scope;
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
			})(null, function (err) {
				if (err.code !== 'ENOENT') throw err;
				return resolveExtTypePath(path, ext);
			});
		};

		resolveExtTypePath = function (path, ext) {
			var exts = extNames[ext];
			if (!exts.length) {
				throw new Error("Module '" + orgFn + "' not found, as required in '" + fromfile + "'");
			}
			return deferred.some(exts, function (ext) {
				return statP(path + ext)(function (stats) {
					if (stats.isFile()) {
						path += ext;
						return true;
					}
					return false;
				}, function (err) {
					if (err.code !== 'ENOENT') throw err;
					return false;
				});
			})(function (found) {
				if (!found) {
					throw new Error("Module '" + orgFn + "' not found, as required in '" + fromfile + "'");
				}
				return path;
			});
		};

		resolvePath = (function () {
			var resolvePath = function (path, forceIndex) {
				return resolveFirstTypePath(path)(null, function (err) {
					return statP(path)(function (stats) {
						if (stats.isDirectory()) {
							if (forceIndex) return resolveFirstTypePath(resolve(path, 'index'));
							return resolveDirPath(path);
						}
						throw err;
					}, function (e) {
						if (e.code !== 'ENOENT') throw e;
						throw err;
					});
				});
			};
			return function (path, forceIndex) {
				var ext = extname(path).toLowerCase();
				if ((ext === '.js') || (ext === '.json') || (ext === '.css') || (ext === '.html')) {
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
				index = commonPath(dirpath + sep, path + sep).length;
				if (!index) throw new Error("Require out of package root scope");
				++index;

				dirpath = dirpath.slice(index);
				path = path.slice(index);

				if (dirpath) {
					tokens = dirpath.split(sep);
					if (tokens.length > tree.length) throw new Error("Require out of package root scope");
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
		}.bind(this), function (error) {
			if (isOptional(lScope[basename(fromfile)], dep.point, dep.raw.length)) return;
			throw error;
		});
	},
	resolveExternal: function (fromfile, dirname, scope, dep) {
		// console.log("RE", dep.value);
		var org = dep.value, filename = join(dep.value)
		  , lScope = scope, name, tree, require, main, path, cache, ext;
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
					if (isOptional(scope[basename(fromfile)], dep.point, dep.raw.length)) return;
					throw new Error("Module '" + filename + "' not found, as required in '" + fromfile + "'");
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
					if (isOptional(scope[basename(fromfile)], dep.point, dep.raw.length)) return;
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
					this.packages[name] = path.slice(0, name.length - (filename.length + ext.length));
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
			promise.aside(function (module) { this.modules[name] = module; }.bind(this));
			return promise;

		}.bind(this))()(function (scope) {
			// console.log('RFT', name, this.modules[name] === scope);
			if (!scope) return;
			tree = [];
			if (name === filename) filename = scope[':mainpath:'] || 'index';
			else filename = filename.slice(name.length + 1);
			// console.log("RE", name, scope, filename);
			dep.localFilename = filename;
			return this.resolveLocal(fromfile, this.packages[name], scope, tree, dep, org, lScope);
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
			throw customError("Extension '" + name + "' not found. Make sure" +
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
		throw customError("Extension '" + (name || ext.extension) +
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
		if (isArray(options.ext)) options.ext.forEach(getExt, ext);
		else getExt.call(ext, options.ext);
	}
	return create(parser, {
		modules: d({}),
		packages: d({}),
		modulesFiles: d([]),
		useStrict: d(Boolean(options.useStrict)),
		sourceMap: d(Boolean(options.sourceMap)),
		ignoreErrors: d(Boolean(options.ignoreErrors)),
		transform: d(options.transform != null ? callable(options.transform) : null),
		prettyOutput: d((options.prettyOutput == null) ? true :
				Boolean(options.prettyOutput)),
		cache: d(Boolean(options.cache)),
		ext: d(ext),
		extNames: d(map(ext, function (value) { return keys(value); })),
		depsMap: d({})
	});
};
exports.modulesToString = modulesToString;
