'use strict';

var fs             = require('fs')
  , path           = require('path')

  , isEmpty        = require('es5-ext/lib/Object/plain/is-empty').call
  , oFilter        = require('es5-ext/lib/Object/plain/filter').call
  , findRoot       = require('next/lib/find-package-root')

  , requireRegExp, templatePath, parseDependencies, readFile, readModule
  , readModules, getModuleText, getModulesText, passTokens;

requireRegExp = /(?:^\s*|([^\s])(\s*))require\s*\(\s*(?:'([^']+)'|"([^"]+)"|[^)]+)\s*\)/;
passTokens = ['!', '?', ':', '+', '-', '=', '%', '&', '*', '(', '|', ';', ',', '/'];
templatePath = __dirname + '/template';

parseDependencies = function (text) {
	var match, paths = [];
	while ((match = text.match(requireRegExp))) {
		text = text.slice(text.indexOf(match[0]) + match[0].length);
		if (match[2]) {
			if (match[1] === ".") {
				continue;
			}
		} else if (match[1] && (passTokens.indexOf(match[1]) === -1)) {
			continue;
		}
		var path = match[3] || match[4];
		if (!path) {
			throw new TypeError("Not supported require call: '" + match[0] + "'");
		}
		paths.push(path);
	}
	return paths;
};

readFile = function (file, callback) {
	fs.readFile(file, 'utf-8', function (err, text) {
		if (err) {
			callback(err);
			return;
		}
		var deps;
		try {
			deps = parseDependencies(text);
			// console.log("READ", file, deps);
			callback(null, text, deps);
		} catch (e) {
			callback(e);
		}
	});
};

readModule = function (basepath, modpath, modules, tree, callback) {
	var paths, name, dir;
	paths = modpath.split('/');
	name = paths.pop();
	while ((dir = paths.shift())) {
		if (dir === '..') {
			if (!tree.length) {
				callback(new Error('Cannot look out of package root scope.'));
				return;
			}
			modules = tree.pop();
		} else if (dir !== '.') {
			tree.push(modules);
			modules = modules[dir] || (modules[dir] = {});
		}
	}
	if (typeof modules[name] === "undefined") {
		basepath = path.normalize(basepath + "/" + path.dirname(modpath));
		readFile(basepath + "/" + name + ".js", function (err, text, dependencies) {
			if (err) {
				callback(err);
				return;
			}
			modules[name] = text;
			readModules(basepath, dependencies, modules, tree, callback);
		});
	} else {
		callback();
	}
};

readModules = function (basepath, names, modules, tree, callback) {
	var iterate = function (err) {
		if (err) {
			callback(err);
			return;
		}
		if (names.length) {
			readModule(basepath, names.shift(), modules, [].concat(tree), iterate);
		} else {
			callback();
		}
	};
	iterate();
};

getModuleText = function (module) {
	return Object.keys(module).map(function (name) {
		var text = '\n\'' + name + '\': ';
		if (typeof module[name] === "object") {
			text += '{\n' + getModuleText(module[name]) + '}';
		} else {
			text += 'function (exports, module, require) {\n\n' + module[name] + '\n}';
		}
		return text;
	}).join(',\n\n');
};

getModulesText = function (modules) {
	return "{\n'.':{\n" + getModuleText(modules) + "}}";
};

module.exports = function (input, output, callback) {
	var program, modules = {}, current = modules, tree = [];
	readFile(input, function (err, text, dependencies) {
		if (err) {
			callback(err);
			return;
		}
		program = text;
		findRoot(input, function (err, root) {
			if (err) {
				callback(err);
				return;
			}
			var paths = input.slice(root.length + 1).split('/');
			paths.pop();
			paths.forEach(function (dir) {
				tree.push(current);
				current = current[dir] = {};
			});
			readModules(path.dirname(input), dependencies, current, tree, function (err) {
				if (err) {
					callback(err);
					return;
				}
				fs.readFile(templatePath, 'utf-8', function (err, text) {
					if (err) {
						callback(err);
						return;
					}

					var tree = ['modules'], cur = 'modules';
					if (paths.length) {
						tree.push(cur += '[\'.\']');
					}
					paths.slice(0, -1).forEach(function (name) {
						tree.push(cur += '[\'' + name +'\']');
					});
					fs.writeFile(output, text
						.replace('MODULES', getModulesText(modules))
						.replace('PROGRAM', program)
						.replace('PATH', '[\'' + ['.'].concat(paths).join('\'][\'') + '\']')
						.replace('TREE', tree.join(', ')), callback);
				});
			});
		});
	});
};
