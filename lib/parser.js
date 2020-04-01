"use strict";

const aFrom                                              = require("es5-ext/array/from")
    , last                                               = require("es5-ext/array/#/last")
    , customError                                        = require("es5-ext/error/custom")
    , map                                                = require("es5-ext/object/map")
    , callable                                           = require("es5-ext/object/valid-callable")
    , validValue                                         = require("es5-ext/object/valid-value")
    , isString                                           = require("es5-ext/string/is-string")
    , isValue                                            = require("es5-ext/object/is-value")
    , sLast                                              = require("es5-ext/string/#/last")
    , indent                                             = require("es5-ext/string/#/indent")
    , endsWith                                           = require("es5-ext/string/#/ends-with")
    , optionalChaining                                   = require("es5-ext/optional-chaining")
    , d                                                  = require("d")
    , deferred                                           = require("deferred")
    , memoize                                            = require("memoizee/plain")
    , cjsResolve                                         = require("ncjsm/resolve/sync")
    , { stat }                                           = require("fs")
    , { basename, extname, dirname, join, resolve, sep } = require("path")
    , commonPath                                         = require("path2/common")
    , getRequire                                         = require("next/module/get-require")
    , { readFile }                                       = require("fs2/read-file")
    , findRequires                                       = require("find-requires")
    , log                                                = require("log").get("webmake")
    , findRoot                                           = require("./find-package-root");

const { isArray } = Array
    , { create, keys } = Object
    , { parse, stringify } = JSON
    , readFileOpts = { encoding: "utf8" }
    , getThis = function () { return this; }
    , sheBangRe = /^(#![\0-\t\u000b-\uffff]*)\n/u;

if (!isValue(sep)) {
	throw new Error("Unsupported Node version. Please upgrade, Webmake needs at least Node v0.8");
}
const dirEndMatch = new RegExp(`(?:^|/|\\${ sep })\\.*$`, "u");
const packageNamePattern = new RegExp(
	`(@[^\\${ sep }]+\\${ sep }[^\\${ sep }]+|[^@\\${ sep }][^\\${ sep }]*)(?:\\${ sep }|$)`, "u"
);

const cssDeps = [
	{
		value: "webmake/lib/browser/load-css.js",
		raw: "'webmake/lib/browser/load-css.js'",
		point: 0,
		line: 0,
		column: 0
	}
];

const isOptional = (function () {
	const pre = /try\s*\{(?:\s*[a-zA-Z][0-9a-zA-Z]*\s*=)?\s*require\(\s*$/u
	    , post = new RegExp(
			"^\\);?\\s*(?:\\/\\/[\\0-\\x09\\x0b\\x0c\\x0e-" +
				"\\u2027\\u2030-\\uffff]*[\\r\\n\\u2028\\u2029]\\s*)?\\}\\s*catch\\s*\\(",
			"u"
		);
	return function (src, point, pathLength) {
		return pre.test(src.slice(0, point - 1)) && post.test(src.slice(point + pathLength - 1));
	};
})();

const parseDependencies = function (text, filename, ignoreErrors) {
	let deps;
	try {
		deps = findRequires(text, { raw: true });
	} catch (e) {
		throw customError(`${ e.message } in ${ filename }`, "AST_ERROR", { origin: e });
	}
	return deps.filter(node => {
		if (isValue(node.value)) return true;
		if (!ignoreErrors) {
			throw customError(
				`Not parsable require call: \`${ node.raw }\` at ${ filename }:${
					node.line
				}\n             You may` +
					" ignore such errors with ignoreErrors option ('ignore-errors'" +
					" when running from command line)",
				"DYNAMIC_REQUIRE"
			);
		}
		log.warn("Not parsable require call (ignored): %s at %s:%d", node.raw, filename, node.line);
		return false;
	});
};

const statP = memoize(filename => {
	const def = deferred();
	stat(filename, (err, stats) => {
		if (err) def.reject(err);
		else def.resolve(stats);
	});
	return def.promise;
});

const stripBOM = function (source) {
	if (source.charCodeAt(0) === 0xfeff) {
		// Remove BOM, see:
		// https://github.com/joyent/node/blob/master/lib/module.js#L460
		// (...) This catches EF BB BF (the UTF-8 BOM)
		// because the buffer-to-string conversion in `fs.readFile()`
		// translates it to FEFF, the UTF-16 BOM. (...)
		source = source.slice(1);
	}
	return source;
};

const getMain = memoize(path =>
	readFile(
		resolve(path, "package.json"), readFileOpts
	)(content => {
		const { main } = parse(stripBOM(content));
		if (!main) throw new Error("No main setting found");
		return main;
	})
);

const readFileContent = function (code, filename, fileParser, localFilename) {
	const ext = extname(filename);
	let type, sourceUrl, data;

	if (ext !== ".js" && ext !== ".json" && ext !== ".css" && ext !== ".html") {
		if (hasOwnProperty.call(fileParser.ext[".js"], ext)) type = ".js";
		else if (hasOwnProperty.call(fileParser.ext[".json"], ext)) type = ".json";
		else if (hasOwnProperty.call(fileParser.ext[".css"], ext)) type = ".css";
		else if (hasOwnProperty.call(fileParser.ext[".html"], ext)) type = ".html";

		if (!type) throw new Error("Unexpected extension");

		sourceUrl = localFilename.slice(0, -ext.length) + type;

		// Extension
		if (fileParser.transform) {
			code = deferred(fileParser.transform(filename, code))(transformedCode => {
				if (!isValue(transformedCode)) {
					throw customError(
						"Provided transform callback must return code string", "INVALID_TRANSFORM"
					);
				}
				transformedCode = String(transformedCode);
				const compiledData = fileParser.ext[type][ext].compile(transformedCode, {
					filename,
					localFilename,
					sourceMap: fileParser.sourceMap,
					generatedFilename: sourceUrl
				});
				({ transformedCode } = compiledData);
				if (fileParser.sourceMap && compiledData.sourceMap) {
					transformedCode +=
						"//# sourceMappingURL=data:application/json;" +
						`base64,${ Buffer.from(compiledData.sourceMap).toString("base64") }\n`;
				}
				return transformedCode;
			});
		} else {
			data = fileParser.ext[type][ext].compile(code, {
				filename,
				localFilename,
				sourceMap: fileParser.sourceMap,
				generatedFilename: sourceUrl
			});
			({ code } = data);
			if (fileParser.sourceMap && data.sourceMap) {
				code += `//# sourceMappingURL=data:application/json;base64,${
					Buffer.from(data.sourceMap).toString("base64")
				}\n`;
			}
		}
	} else {
		type = ext;
		sourceUrl = localFilename;
		if (fileParser.transform) {
			code = deferred(fileParser.transform(filename, code))(transformedData => {
				let transformedCode;
				if (!isValue(transformedData)) {
					throw customError(
						"Provided transform callback must return code string", "INVALID_TRANSFORM"
					);
				}
				transformedCode =
					transformedData.code === undefined ? transformedData : transformedData.code;
				if (ext === ".js") {
					transformedCode = stripBOM(String(transformedCode)).replace(
						sheBangRe, "//$1\n"
					);
				} else {
					transformedCode = String(transformedCode);
				}
				if (fileParser.sourceMap && transformedData.sourceMap) {
					transformedCode +=
						"//# sourceMappingURL=data:application/json;" +
						`base64,${ Buffer.from(transformedData.sourceMap).toString("base64") }\n`;
				}
				return transformedCode;
			});
		} else if (ext === ".js") {
			code = stripBOM(code).replace(sheBangRe, "//$1\n");
		}
	}
	return deferred(code)(resolvedCode => {
		let deps;
		resolvedCode = String(resolvedCode);
		if (type === ".json") {
			resolvedCode = `module.exports = ${ resolvedCode.trim() };\n`;
			deps = [];
		} else if (type === ".css") {
			resolvedCode = `require('webmake/lib/browser/load-css.js')(${
				stringify(resolvedCode.trim())
			});\n`;
			deps = cssDeps;
		} else if (type === ".html") {
			resolvedCode = `module.exports = ${ stringify(resolvedCode) };\n`;
			deps = [];
		} else {
			if (sLast.call(resolvedCode) !== "\n") resolvedCode += "\n";
			deps = parseDependencies(resolvedCode, filename, fileParser.ignoreErrors);
		}

		if (fileParser.sourceMap) {
			resolvedCode = `eval(${
				stringify(`${ resolvedCode }//# sourceURL=${ sourceUrl }`)
			});\n`;
		}
		return { content: resolvedCode, deps };
	});
};

const readFileData = function (filename, fileParser, localFilename) {
	return readFile(
		filename, readFileOpts
	)(code => readFileContent(code, filename, fileParser, localFilename));
};

const readFileDataCached = (function () {
	const cache = {};
	return function (filename, fileParser, localFilename) {
		let data;
		if (hasOwnProperty.call(cache, filename)) data = cache[filename];
		else data = cache[filename] = {};
		return statP(filename)(stats => {
			stats = `${ stats.size }.${ stats.mtime.valueOf() }`;
			if (data.stats === stats) return data.data;
			data.stats = stats;
			return (data.data = readFileData(filename, fileParser, localFilename));
		});
	};
})();

const modulesToString = function self(nest, moduleParser) {
	const format = moduleParser.prettyOutput ? indent : getThis;
	return keys(this)
		.sort()
		.map(function (name) {
			const current = this[name];
			let text = `${ format.call(stringify(name), "\t", nest + 1) }: `;

			if (name === ":mainpath:") {
				// Package main instruction
				text += stringify(current);
			} else if (typeof current === "string") {
				// Module
				text += `function (exports, module, require) {\n${
					format.call(current, "\t", nest + 2)
				}${ format.call("}", "\t", nest + 1) }`;
			} else {
				// Folder
				text += `{\n${ self.call(current, nest + 1, moduleParser) }\n${
					format.call("}", "\t", nest + 1)
				}`;
			}
			return text;
		}, this)
		.join(",\n");
};

const parser = {
	readInput(input, options = {}) {
		options = Object(options);
		const tree = [], { stream } = options;
		let scope, path, content, def;
		input = resolve(String(input));
		statP.clear();
		getMain.clear();
		if (stream) {
			def = deferred();
			content = "";
			stream.on("data", data => { content += data; });
			stream.on("error", def.reject);
			stream.on("end", () => { def.resolve(content); });
		}
		return findRoot(input)(root => {
			let name, dirs, result;
			name = root ? last.call(root.split(sep)) : "/";
			if (!this.modules[name]) {
				this.packages[name] = root || sep;
				this.modules[name] = {};
			}
			scope = this.modules[name];
			dirs = root ? input.slice(root.length + 1) : input.slice(1);
			path = name + (root ? sep : "") + dirs;
			dirs = dirs.split(sep);
			name = dirs.pop();
			dirs.forEach(dir => {
				tree.push(scope);
				scope = scope[dir] || (scope[dir] = {});
			});
			if (scope[name]) return scope[name];
			if (!stream) {
				result = this.readFile(input, name, scope, tree);
				if (!scope[name]) scope[name] = result;
				return result;
			}
			return def.promise(fileContent =>
				readFileContent(
					fileContent, name, this, name
				)(data => {
					scope[name] = data.content;
					return deferred.map(
						data.deps, this.resolve.bind(this, input, dirname(input), scope, [])
					);
				})
			);
		})(() => path.slice(0, -extname(path).length).replace(/\\/gu, "/"));
	},
	readFile(filename, name, scope, tree) {
		log.debug("read %s", filename);
		const read = this.cache ? readFileDataCached : readFileData;
		return read(
			filename, this, filename.split(sep).slice(-2 - tree.length).join("/")
		)(data => {
			this.modulesFiles.push(filename);
			scope[name] = data.content;
			return deferred
				.map(data.deps, this.resolve.bind(this, filename, dirname(filename), scope, tree))
				.aside(filePath => { this.depsMap[filename] = filePath; });
		});
	},
	resolve(fromfile, currentDirname, scope, tree, dep) {
		log.debug("resolve %s", dep.value);
		tree = aFrom(tree);
		if (dep.value[0] === ".") {
			return this.resolveLocal(fromfile, currentDirname, scope, tree, dep);
		}
		return this.resolveExternal(fromfile, currentDirname, scope, dep);
	},
	resolveLocal(fromfile, dirpath, scope, tree, dep, orgFn, lScope) {
		const filename = dep.localFilename || dep.value, { extNames } = this;
		log.debug("resolve local %s %s %s %d", filename, dirpath, fromfile, tree.length);

		if (!lScope) lScope = scope;
		if (!orgFn) orgFn = filename;

		const resolveExtTypePath = (path, ext) => {
			const exts = extNames[ext];
			if (!exts.length) {
				throw new Error(`Module '${ orgFn }' not found, as required in '${ fromfile }'`);
			}
			return deferred.some(exts, fileExt =>
				statP(path + fileExt)(
					stats => {
						if (stats.isFile()) {
							path += fileExt;
							return true;
						}
						return false;
					},
					err => {
						if (err.code !== "ENOENT") throw err;
						return false;
					}
				)
			)(found => {
				if (!found) {
					throw new Error(
						`Module '${ orgFn }' not found, as required in '${ fromfile }'`
					);
				}
				return path;
			});
		};

		const resolveSpecificPath = function (path, ext) {
			return statP(path + ext)(stats => {
				if (stats.isFile()) return path + ext;
				throw new Error("Not Found");
			})(null, err => {
				if (err.code !== "ENOENT") throw err;
				return resolveExtTypePath(path, ext);
			});
		};

		const resolveFirstTypePath = function (path) {
			return resolveSpecificPath(path, ".js")(null, () =>
				resolveSpecificPath(path, ".json")(null, () =>
					resolveSpecificPath(path, ".css")(null, () =>
						resolveSpecificPath(path, ".html")
					)
				)
			);
		};

		const resolvePath = (function () {
			const currentResolvePath = function (path, forceIndex) {
				return resolveFirstTypePath(path)(null, err =>
					statP(path)(
						stats => {
							if (stats.isDirectory()) {
								if (forceIndex) return resolveFirstTypePath(resolve(path, "index"));
								// eslint-disable-next-line no-use-before-define
								return resolveDirPath(path);
							}
							throw err;
						},
						e => {
							if (e.code !== "ENOENT") throw e;
							throw err;
						}
					)
				);
			};
			return function (path, forceIndex) {
				const ext = extname(path).toLowerCase();
				if (ext === ".js" || ext === ".json" || ext === ".css" || ext === ".html") {
					return resolveSpecificPath(path.slice(0, -ext.length), ext)(null, () =>
						currentResolvePath(path, forceIndex)
					);
				}
				return currentResolvePath(path, forceIndex);
			};
		})();

		const resolveDirPath = function (path) {
			return getMain(path)(
				main => resolvePath(resolve(path, main), true),
				() => resolveFirstTypePath(resolve(path, "index"))
			);
		};

		const init = dirEndMatch.test(filename) ? resolveDirPath : resolvePath;
		return init(resolve(dirpath, filename))(
			initFilename => {
				const name = basename(initFilename);
				let path = dirname(initFilename), dir, tokens, index;

				if (path !== dirpath) {
					index = commonPath(dirpath + sep, path + sep).length;
					if (!index) throw new Error("Require out of package root scope");
					++index;

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
				if (this.ignored.has(initFilename)) return initFilename;
				if (scope[name]) return initFilename;
				const result = this.readFile(initFilename, name, scope, tree);
				if (!scope[name]) scope[name] = result;
				return result(initFilename);
			},
			error => {
				if (isOptional(lScope[basename(fromfile)], dep.point, dep.raw.length)) return;
				throw error;
			}
		);
	},
	resolveExternal(fromfile, fileDirname, scope, dep) {
		log.debug("resolve external %s", dep.value);
		const org = dep.value, lScope = scope;
		let filename = join(dep.value), tree, currentRequire, main, path, ext;

		const [, name] = filename.match(packageNamePattern);
		const packageName = name.includes(sep) && sep !== "/" ? name.replace(sep, "/") : name;
		return deferred.promisifySync(() => {
			// If already processed, return result
			if (this.modules[packageName]) return this.modules[packageName];

			if (name === "webmake") {
				this.packages.webmake = resolve(__dirname, "../");
				return (this.modules.webmake = {});
			}
			// Find path to package with Node.js internal functions
			currentRequire = getRequire(fromfile);
			try {
				path = main = currentRequire.resolve(name);
				log.debug("external %s main %s", name, path);
			} catch (e) {
				log.debug("external %s has no main module", name);
				// No main module for the package, try full require path
				try {
					path = currentRequire.resolve(org);
				} catch (e2) {
					if (isOptional(scope[basename(fromfile)], dep.point, dep.raw.length)) {
						return null;
					}
					throw new Error(
						`Module '${ filename }' not found, as required in '${ fromfile }'`
					);
				}
			}
			if (main === name) {
				// Require of Node.js native package.
				// Hack Node.js internals to get path to substitite
				// eventually provided in node_modules
				path = main = optionalChaining(
					cjsResolve(fileDirname, name, { silent: true }), "targetPath"
				);
				if (!main) {
					// No substitute found
					if (isOptional(scope[basename(fromfile)], dep.point, dep.raw.length)) {
						return null;
					}
					if (!this.ignoreErrors) {
						throw new Error(
							`Cannot require ${ stringify(name) } (as in '${
								fromfile
							}').\n       Native node.js modules` +
								" are not ported to client-side. You can however provide" +
								" an alternative version of this module in your node_modules" +
								" path, it will be picked up by Webmake.\n"
						);
					}
					log.warn("Require of native %s approached (ignored)", name);
					return null;
				}
			}

			// Find package root
			if (!main) {
				// Try to calculate root by string subtraction
				ext = extname(path);
				if (endsWith.call(path, filename + ext)) {
					this.packages[name] = path.slice(
						0, name.length - (filename.length + ext.length)
					);
					return (this.modules[packageName] = {});
				}
				if (endsWith.call(path, filename)) {
					this.packages[name] = path.slice(0, name.length - filename.length);
					return (this.modules[packageName] = {});
				}
			}
			// Use dedicated findRoot
			const promise = (this.modules[packageName] = findRoot(path)(root => {
				const currentModule = {};
				this.packages[name] = root;
				return getMain(root)(mainModule => {
					currentModule[":mainpath:"] = mainModule;
					return currentModule;
				}, currentModule);
			}));
			promise.aside(currentModule => { this.modules[packageName] = currentModule; });
			return promise;
		})()(currentScope => {
			if (!currentScope) return null;
			tree = [];
			if (name === filename) filename = currentScope[":mainpath:"] || "index";
			else filename = filename.slice(name.length + 1);
			dep.localFilename = filename;
			return this.resolveLocal(
				fromfile, this.packages[name], currentScope, tree, dep, org, lScope
			);
		});
	},
	toString() {
		let str = "";
		if (this.useStrict) {
			str += "(function () { 'use strict'; return ";
		}
		str += `{\n${ modulesToString.call(this.modules, 0, this) }\n}`;
		if (this.useStrict) {
			str += "; }())";
		}
		return str;
	}
};

const getExt = function (ext) {
	let name;
	if (isString(ext)) {
		name = String(ext);
		try {
			ext = require(`webmake-${ name }`);
		} catch (e) {
			if (e.code !== "MODULE_NOT_FOUND") throw e;
			throw customError(
				`Extension '${ name }' not found. Make sure` +
					` you have package 'webmake-${ name }' installed.`,
				"EXTENSION_NOT_INSTALLED"
			);
		}
	} else {
		({ name } = ext);
	}
	validValue(ext.extension);
	callable(ext.compile);
	const type = `.${ ext.type || "js" }`;
	if (!hasOwnProperty.call(this, type)) {
		throw customError(
			`Extension '${ name || ext.extension }' configured for unknown type '${ type }'`
		);
	}
	if (isArray(ext.extension)) {
		ext.extension.forEach(function (extName) {
			this[type][`.${ String(extName) }`] = ext;
		}, this);
	} else {
		this[type][`.${ String(ext.extension) }`] = ext;
	}
};

module.exports = exports = function (options = {}) {
	const ext = { ".js": {}, ".json": {}, ".css": {}, ".html": {} };
	options = Object(options);
	if (options.ext) {
		if (isArray(options.ext)) options.ext.forEach(getExt, ext);
		else getExt.call(ext, options.ext);
	}
	const ignored = options.ignore ? new Set(aFrom(options.ignore)) : new Set();

	return create(parser, {
		modules: d({}),
		packages: d({}),
		modulesFiles: d([]),
		useStrict: d(Boolean(options.useStrict)),
		ignored: d(ignored),
		sourceMap: d(Boolean(options.sourceMap)),
		ignoreErrors: d(Boolean(options.ignoreErrors)),
		transform: d(isValue(options.transform) ? callable(options.transform) : null),
		prettyOutput: d(isValue(options.prettyOutput) ? Boolean(options.prettyOutput) : true),
		cache: d(Boolean(options.cache)),
		ext: d(ext),
		extNames: d(map(ext, value => keys(value))),
		depsMap: d({})
	});
};
exports.modulesToString = modulesToString;
