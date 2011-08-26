'use strict';

var path        = require('path')
  , fs          = require('fs')
  , clone       = require('es5-ext/lib/Array/clone').call
  , getArray    = require('es5-ext/lib/Array/get-array')
  , peek        = require('es5-ext/lib/List/peek').call
  , shiftSame   = require('es5-ext/lib/List/shift-same').call
  , aritize     = require('es5-ext/lib/Function/aritize').call
  , invoke      = require('es5-ext/lib/Function/invoke')
  , isFunction  = require('es5-ext/lib/Function/is-function')
  , k           = require('es5-ext/lib/Function/k')
  , lock        = require('es5-ext/lib/Function/lock').call
  , rcurry      = require('es5-ext/lib/Function/rcurry').call
  , indent      = require('es5-ext/lib/String/indent')().call
  , trimRight   = require('es5-ext/lib/String/trim-right-str').call
  , trimLeft    = require('es5-ext/lib/String/trim-left-str').call
  , s2p         = require('deferred/lib/sync-to-promise').call
  , all         = require('deferred/lib/join/all')
  , ba2p        = require('deferred/lib/async-to-promise').bind
  , getRequire  = require('next/lib/get-require')
  , findRoot    = ba2p(require('next/lib/find-package-root'))
  , fileExists  = ba2p(require('next/lib/fs/file-exists'))
  , dirExists   = ba2p(require('next/lib/fs/dir-exists'))
  , filesAtPath = ba2p(require('next/lib/fs/files-at-path'))

  , dirname = path.dirname, normalize = path.normalize
  , readFile = ba2p(fs.readFile), writeFile = ba2p(fs.writeFile)
  , stringify = JSON.stringify

  , re = /(?:^\s*|([^\s])\s*)require\s*\(\s*(?:'([^']+)'|"([^"]+)"|[^)]+)\s*\)/
	  , tokens = ['!', '?', ':', '+', '-', '=', '%', '&', '*', '(', '|', ';', ',',
			'/', '}', '{']

  , parseDependencies, Parser, templatePath, modulesToString;

templatePath = __dirname + '/webmake.tpl';

parseDependencies = function (text) {
	var match, paths = [], path;
	while ((match = text.match(re))) {
		text = text.slice(text.indexOf(match[0]) + match[0].length);
		if (match[1] && (tokens.indexOf(match[1]) === -1)) {
			continue;
		}
		path = match[2] || match[3];
		if (!path) {
			throw new TypeError("Not supported require call: '" + match[0] + "'");
		}
		path = trimRight(path, '.js');
		paths.push(path);
	}
	return paths;
};

Parser = {
	init: function (input) {
		this.modules = {};
		this.packages = {};
		return this;
	},
	readInput: function (input) {
		var scope, path, tree = [];
		return findRoot(input)
		(function (root) {
			var name, dirs;
			name = peek(root.split('/'));
			if (!this.modules[name]) {
				this.packages[name || '/'] = root || '/';
				this.modules[name || '/'] = {};
			}
			scope = this.modules[name];
			path = name + '/' + (dirs = trimLeft(input, root || '').slice(1, -3));
			dirs = dirs.split('/');
			name = dirs.pop();
			dirs.forEach(function (dir) {
				tree.push(scope);
				scope = scope[dir] || (scope[dir] = {});
			});
			return this.readFile(input, name, scope, tree);
		}.bind(this))
		(function () {
			return path;
		})
	},
	readFile: function (filename, name, scope, tree) {
		// console.log("PC", filename);
		return readFile(filename, 'utf8')
		(function (content) {
			if (content.charCodeAt(0) === 0xFEFF) {
				// Remove BOM, see: https://github.com/joyent/node/commit/ac722bbed6ea846991904ed205a6dc5ece4748c9
				// (...) This catches EF BB BF (the UTF-8 BOM)
				// because the buffer-to-string conversion in `fs.readFile()`
				// translates it to FEFF, the UTF-16 BOM. (...)
				content = content.slice(1);
			}
			if (peek(content) !== '\n') {
				content += '\n';
			}
			scope[name] = content;
			return all(parseDependencies(content),
				this.resolve.bind(this, dirname(filename), scope, tree));
		}.bind(this));
	},
	resolve: function (dirname, scope, tree, filename) {
		// console.log("R", filename);
		tree = clone(tree);
		if (peek(filename) === '/') {
			filename = filename.slice(0, -1);
		}
		if (filename[0] === '.') {
			return this.resolveLocal(dirname, scope, tree, filename);
		} else {
			return this.resolveExternal(dirname, filename);
		}
	},
	resolveLocal: function (dirname, scope, tree, filename) {
		// console.log("RL", filename, dirname);
		var path, dir, name, pname;
		path = filename.split('/');
		name = path.pop();
		filename = normalize(dirname + '/' + filename);
		return fileExists(filename + '.js')
		(function (exists) {
			if (exists) {
				filename += '.js';
			} else {
				return dirExists(filename)
				(function (exists) {
					if (exists) {
						path.push(name);
						name = 'index';
						filename += '/index.js';
					} else {
						throw new Error("Module not found '" + filename + "'");
					}
				})
			}
		})
		(function () {
			while ((dir = path.shift())) {
				if (dir === '.') {
					continue;
				} else if (dir === '..') {
					if (!tree.length) {
						throw new Error("Require out of package root scope");
					}
					scope = tree.pop();
				} else {
					tree.push(scope);
					scope = scope[dir] || (scope[dir] = {});
				}
			}
			if (scope[name]) {
				return null;
			} else {
				return scope[name] = this.readFile(filename, name, scope, tree);
			}
		}.bind(this));
	},
	resolveExternal: function (dirname, filename) {
		// console.log("RE", filename);
		var name = filename.split('/', 1)[0], tree, require, main, path;
		return s2p(function () {
			if (this.modules[name]) {
				return this.modules[name];
			} else {
				require = getRequire(dirname);
				try {
					path = main = require.resolve(name);
				} catch (e) {
					path = require.resolve(filename);
				}
				if (main === name) {
					throw new Error("Cannot require " + stringify(name)+ " it's node specific module, that won't work.");
				}
				return this.modules[name] = findRoot(path)
				(function (root) {
					this.packages[name] = root;
					this.modules[name] = {};
					if (main) {
						this.modules[name][':mainpath:']
							= shiftSame(main, root).slice(1, -3);
					}
					return this.modules[name];
				}.bind(this));
			}
		}.bind(this))
		(function (scope) {
			// console.log('RFT', name, this.modules[name] === scope);
			tree = [];
			if (name === filename) {
				filename = scope[':mainpath:'];
			} else {
				filename = shiftSame(filename, name).slice(1);
			}
			// console.log("RE", name, scope, filename);
			return this.resolveLocal(this.packages[name], scope, tree, filename);
		}.bind(this));
	}
};

modulesToString = function self (module, nest) {
	var keys = Object.keys(module);
	nest = nest || 0;
	keys.sort();
	return keys.map(function (name) {
		var text = indent(stringify(name), nest + 1) + ': ';
		if (name === ':mainpath:') {
			text += stringify(module[name]);
		} else if (typeof module[name] === "object") {
			text += '{\n' + self(module[name], nest + 1) + '\n' +
				indent('}', nest + 1);
		} else {
			text += 'function (exports, module, require) {\n' +
				indent(module[name], nest + 2) + indent('}', nest + 1);
		}
		return text;
	}).join(',\n');
};

module.exports = function (input, options, cb) {
	if (isFunction(options)) {
		cb = options;
		options = {};
	}
	var parser = Object.create(Parser).init();
	parser.readInput(input)
	(function (path) {
		return all(getArray(options.include),
			aritize(filesAtPath, 1),
			invoke('filter', function (filename) {
				return filename.slice(-3) === '.js';
			}),
			rcurry(all, parser.readInput.bind(parser)))
		(lock(readFile, templatePath, 'utf8'))
		(function (tpl) {
			var src = tpl +
				'({\n' + modulesToString(parser.modules) + '\n})\n' +
				'(' + stringify(path) + ');\n';
			return options.output ? writeFile(options.output, src) : src;
		});
	}).cb(cb);
};
