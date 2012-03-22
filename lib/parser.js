'use strict';

var create       = Object.create
  , keys         = Object.keys
  , stringify    = JSON.stringify
  , path         = require('path')
  , fs           = require('fs')
  , copy         = require('es5-ext/lib/Array/prototype/copy')
  , peek         = require('es5-ext/lib/Array/prototype/peek')
  , isString     = require('es5-ext/lib/String/is-string')
  , trimCommon   = require('es5-ext/lib/String/prototype/trim-common-left')
  , d            = require('es5-ext/lib/Object/descriptor')
  , indent       = require('es5-ext/lib/String/get-indent')()
  , deferred     = require('deferred')
  , getRequire   = require('next/lib/get-require')
  , separator    = require('next/lib/path/separator')
  , findRoot     = deferred.promisify(require('next/lib/find-package-root'))
  , fileExists   = deferred.promisify(require('next/lib/fs/file-exists'))
  , dirExists    = deferred.promisify(require('next/lib/fs/dir-exists'))
  , findRequires = require('find-requires')

  , dirname = path.dirname, join = path.join, resolve = path.resolve
  , readFile = deferred.promisify(fs.readFile)

  , parseDependencies, parser, modulesToString;

parseDependencies = function (text) {
	return findRequires(text, { raw: true }).map(function (node) {
		var path = node.value;
		if (!path) {
			throw new TypeError("Not supported require call: '" + node.raw + "'");
		}
		return (path.slice(-3) === '.js') ? path.slice(0, -3) : path;
	});
};

modulesToString = function self(nest, options) {
	return keys(this).sort().map(function (name) {
		var current = this[name]
		  , text = indent.call(stringify(name), nest + 1) + ': ';
		if (name === ':mainpath:') {
			text += stringify(current);
		} else if (!isString(current)) {
			text += '{\n' + self.call(current, nest + 1, options) + '\n' +
				indent.call('}', nest + 1);
		} else {
			text += 'function (exports, module, require) {\n' +
				indent.call(options.sourceMap ?
						'eval(' + stringify(current + '\n//@ sourceURL=' +
							current.filename) +
						')' : current, nest + 2) +
				indent.call('}', nest + 1);
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
			name = root ? peek.call(root.split(separator)) : '/';
			if (!this.modules[name]) {
				this.packages[name] = root || separator;
				this.modules[name] = {};
			}
			scope = this.modules[name];
			path = name + separator +
				(dirs = trimCommon.call(input, root || '').slice(1));
			dirs = dirs.split(separator);
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
		return readFile(filename, 'utf8')(function (content) {
			this.modulesFiles.push(filename);
			if (content.charCodeAt(0) === 0xFEFF) {
				// Remove BOM, see:
				// https://github.com/joyent/node/blob/master/lib/module.js#L448
				// (...) This catches EF BB BF (the UTF-8 BOM)
				// because the buffer-to-string conversion in `fs.readFile()`
				// translates it to FEFF, the UTF-16 BOM. (...)
				content = content.slice(1);
			}
			if (peek.call(content) !== '\n') {
				content += '\n';
			}
			scope[name] = content = new String(content);
			content.filename = filename.split(separator)
				.slice(-2 - tree.length).join('/');
			return deferred.map(parseDependencies(content),
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
		var path, dir, name, pname, isDir, org;
		filename = join(filename);
		isDir = (peek.call(filename) === separator);
		path = filename.split(separator);
		filename = resolve(dirname + separator + filename);
		return (isDir ? dirExists(filename)(function (exists) {
			if (exists) {
				path.pop();
				name = 'index.js';
				filename += separator + 'index.js';
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
						filename += separator + 'index.js';
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
		var org = filename, name, tree, require, main, path;
		filename = join(filename);
		name = filename.split(separator, 1)[0];
		return deferred.promisify(function () {
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
					throw new Error("Cannot require " + stringify(name) +
						". Native node.js modules are not ported to client-side.");
				}
				return (this.modules[name] = findRoot(path)(function (root) {
					this.packages[name] = root;
					this.modules[name] = {};
					if (main) {
						this.modules[name][':mainpath:']
							= trimCommon.call(main, root).slice(1, -3);
					}
					return this.modules[name];
				}.bind(this)));
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

module.exports = function () {
	return create(parser, {
		modules: d.e({}),
		packages: d.e({}),
		modulesFiles: d.v([])
	});
};
