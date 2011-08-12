(function (modules) {
	var getBuild = function (build) {
		return function (ignore, module) {
			module.exports = build.exports;
		};
	};
	var getModule = function (scope, tree, path) {
		var name, dir, exports = {}, module = { exports: exports }, require, build;
		path = path.split('/');
		name = path.pop();
		while ((dir = path.shift())) {
			if (dir === '..') {
				scope = tree.pop();
			} else if (dir !== '.') {
				tree.push(scope);
				scope = scope[dir];
			}
		}
		require = getRequire(scope, tree);
		build = scope[name];
		scope[name] = getBuild(module);
		build.call(exports, exports, module, require);
		return module.exports;
	};
	var require = function (scope, tree, path) {
		var name;
		if (path.charAt(0) !== '.') {
			name = path.split('/', 1)[0];
			path = path.slice(name.length + 1);
			scope = modules[name];
			tree = [];
			if (!path) {
				path = scope[':mainpath:'];
			}
		}
		return getModule(scope, tree, path);
	};
	var getRequire = function (scope, tree) {
		return function (path) {
			return require(scope, [].concat(tree),
				(path.slice(-3) === '.js') ? path.slice(0, -3) : path);
		};
	};
	return getRequire(modules['.'], []);
})
