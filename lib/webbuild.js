var fs = require('fs');
var path = require('path');
var requireRegExp = /(?:^\s*|([^\s])(\s*))require\s*\(\s*(?:'([^']+)'|"([^"]+)"|[^)]+)\s*\)/;
var templatePath = __dirname + "/_template.js";

var parseDependencies = function (text) {
	var match, paths = [];
	while ((match = text.match(requireRegExp))) {
		if (match[2]) {
			if (match[1] === ".") {
				continue;
			}
		} else if (match[1]) {
			continue;
		}
		var path = match[3] || match[4] || false;
		if (!path) {
			throw new TypeError("Not supported require call: '" + match[0] + "'");
		}
		paths.push(path);
		text = text.slice(text.indexOf(match[0]), match[0].length);
	}
	return paths;
};

var readFile = function (file, callback) {
	fs.readFile(file, 'utf-8', function (err, text) {
		if (err) {
			callback(err);
			return;
		}
		var deps;
		try {
			deps = parseDependencies(text);
			callback(null, text, deps);
		} catch (e) {
			callback(e);
		}
	});
};

var readModule = function (basepath, modpath, modules, tree, callback) {
	var paths, name, dir;
	paths = modpath.split('/');
	name = paths.pop();
	while ((dir = paths.shift())) {
		if (dir === '..') {
			modules = tree.pop();
		} else if (dir !== '.') {
			tree.push(modules);
			modules = modules[dir] || modules[dir] = {};
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

var readModules = function (basepath, names, modules, tree, callback) {
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

var getModuleText = function (module) {
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

var getModulesText = function (modules) {
	return "{\n'.':{\n" + getModuleText(modules) + "}}";
};

module.exports = function (input, output, callback) {
	var program, modules = {};
	readFile(input, function (err, text, dependencies) {
		if (err) {
			callback(err);
			return;
		}
		program = text;
		readModules(path.dirname(input), dependencies, modules, [], function (err) {
			if (err) {
				callback(err);
				return;
			}
			fs.readFile(templatePath, 'utf-8', function (err, text) {
				if (err) {
					callback(err);
					return;
				}
				fs.writeFile(output, text.replace('MODULES', getModulesText(modules))
					.replace('PROGRAM', program), callback);
			});
		});
	});
};
