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
			throw new TypeError("File not found '" + file + "'");
		}
		callback(text, parseDependencies(text));
	});
};

var readModule = function (basepath, modpath, modules, tree, callback) {
	// console.log("READ MODULE", arguments);
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
		readFile(basepath + "/" + name + ".js", function (text, dependencies) {
			modules[name] = text;
			readModules(basepath, dependencies, modules, tree, callback);
		});
	} else {
		callback();
	}
};

var readModules = function (basepath, names, modules, tree, callback) {
	var iterate = function () {
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
	readFile(input, function (text, dependencies) {
		program = text;
		readModules(path.dirname(input), dependencies, modules, [], function () {
			fs.readFile(templatePath, 'utf-8', function (err, text) {
				if (err) {
					throw new TypeError("Could not read template '" + templatePath + "'");
				}
				fs.writeFile(output, text.replace('MODULES', getModulesText(modules))
					.replace('PROGRAM', program), function (err) {
						if (err) {
							throw new TypeError("Could not save output file '" + output + "'");
						}
						callback();
					});
			});
		});
	});
};
