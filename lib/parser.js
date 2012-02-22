'use strict';

var create      = Object.create
  , stringify   = JSON.stringify
  , path        = require('path')
  , fs          = require('fs')
  , copy        = require('es5-ext/lib/Array/prototype/copy')
  , peek        = require('es5-ext/lib/Array/prototype/peek')
  , trimCommon  = require('es5-ext/lib/String/prototype/trim-common-left')
  , d           = require('es5-ext/lib/Object/descriptor')
  , indent      = require('es5-ext/lib/String/get-indent')()
  , deferred    = require('deferred')
  , getRequire  = require('next/lib/get-require')
  , separator   = require('next/lib/path/separator')
  , findRoot    = deferred.promisify(require('next/lib/find-package-root'))
  , fileExists  = deferred.promisify(require('next/lib/fs/file-exists'))
  , dirExists   = deferred.promisify(require('next/lib/fs/dir-exists'))
  
  , findRequires  = require("find-requires")

  , dirname = path.dirname, normalize = path.normalize
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

modulesToString = function self(module, nest) {
    var keys = Object.keys(module);
    nest = nest || 0;
    keys.sort();
    return keys.map(function(name) {
        var text = indent.call(stringify(name), nest + 1) + ': ';
        if(name === ':mainpath:') {
            text += stringify(module[name]);
        } else if( typeof module[name] === "object") {
            text += '{\n' + self(module[name], nest + 1) + '\n' + indent.call('}', nest + 1);
        } else {
			text += 'function (exports, module, require) {\n' + 
                    indent.call('eval(' + stringify(module[name] + '\n//@ sourceURL=' + name) + ')', nest + 2) + "\n" +
                indent.call('}', nest + 1);
		}
		return text;
	}).join(',\n');
};

parser = {
	readInput: function (input) {
		var scope, path, tree = [];
		return findRoot(input)
		(function (root) {
			var name, dirs;
			name = root ? peek.call(root.split(separator)) : separator;
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
		}.bind(this))
		(function () {
			return path.slice(0, -3).replace(/\\/g, '/');
		})
	},
	readFile: function (filename, name, scope, tree) {
		// console.log("PC", filename);
		return readFile(filename, 'utf8')
		(function (content) {
			this.modulesFiles.push(filename);
			if (content.charCodeAt(0) === 0xFEFF) {
				// Remove BOM, see: https://github.com/joyent/node/commit/ac722bbed6ea846991904ed205a6dc5ece4748c9
				// (...) This catches EF BB BF (the UTF-8 BOM)
				// because the buffer-to-string conversion in `fs.readFile()`
				// translates it to FEFF, the UTF-16 BOM. (...)
				content = content.slice(1);
			}
			if (peek.call(content) !== '\n') {
				content += '\n';
			}
			scope[name] = content;
			// scope[name] = {
			    // content: content,
			    // moduleRelativeFilename: filename.split(/[\\\/]/).slice(-2-tree.length).join('/')
			// };
			//scope[name] = new String(content);
			//scope[name].moduleRelativeFilename = filename.split(/[\\\/]/).slice(-2-tree.length).join('/');
			return deferred.map(parseDependencies(content),
				this.resolve.bind(this, filename, dirname(filename), scope, tree));
		}.bind(this));
	},
	resolve: function (fromfile, dirname, scope, tree, filename) {
		// console.log("R", fromfile, dirname, filename);
		tree = copy.call(tree);
		if (peek.call(filename) === '/') {
			filename = filename.slice(0, -1);
		}
		if (filename[0] === '.') {
			return this.resolveLocal(fromfile, dirname, scope, tree, filename);
		} else {
			return this.resolveExternal(fromfile, dirname, filename);
		}
	},
	resolveLocal: function (fromfile, dirname, scope, tree, filename) {
		// console.log("RL", filename, dirname);
		var path, dir, name, pname;
		path = filename.split('/');
		name = path.pop();
		filename = normalize(dirname + '/' + filename);
		return fileExists(filename + '.js')
		(function (exists) {
			if (exists) {
				filename += '.js';
				name += '.js';
			} else {
				return dirExists(filename)
				(function (exists) {
					if (exists) {
						path.push(name);
						name = 'index.js';
						filename += '/index.js';
					} else {
						throw new Error("Module '" + filename +
							"' not found, as required in '" + fromfile + "'");
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
	resolveExternal: function (fromfile, dirname, filename) {
		// console.log("RE", filename);
		var name = filename.split('/', 1)[0], tree, require, main, path;
		return deferred.promisify(function () {
			if (this.modules[name]) {
				return this.modules[name];
			} else {
				require = getRequire(fromfile);
				try {
					path = main = require.resolve(name);
				} catch (e) {
					try {
						path = require.resolve(filename);
					} catch (e) {
						throw new Error("Module '" + filename +
							"' not found, as required in '" + fromfile + "'");
					}
				}
				if (main === name) {
					throw new Error("Cannot require " + stringify(name) +
						" it's node specific module, that won't work.");
				}
				return this.modules[name] = findRoot(path)
				(function (root) {
					this.packages[name] = root;
					this.modules[name] = {};
					if (main) {
						this.modules[name][':mainpath:']
							= trimCommon.call(main, root).slice(1, -3).replace('\\', '/');
					}
					return this.modules[name];
				}.bind(this));
			}
		}.bind(this))()
		(function (scope) {
			// console.log('RFT', name, this.modules[name] === scope);
			tree = [];
			if (name === filename) {
				filename = scope[':mainpath:'];
			} else {
				filename = trimCommon.call(filename, name).slice(1);
			}
			// console.log("RE", name, scope, filename);
			return this.resolveLocal(fromfile, this.packages[name], scope, tree, filename);
		}.bind(this));
	},
	toString: function () {
		return '{\n' + modulesToString(this.modules) + '\n}';
	}
};

module.exports = function () {
	return create(parser, {
		modules: d.e({}),
		packages: d.e({}),
		modulesFiles: d.v([])
	});
};
