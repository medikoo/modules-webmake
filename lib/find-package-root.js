// For given path returns root package path.
// If given path doesn't point to package content then null is returned.

"use strict";

const { promisify }                  = require("deferred")
    , memoize                        = require("memoizee")
    , { basename, dirname, resolve } = require("path")
    , stat                           = promisify(require("fs").stat);

module.exports = memoize(
	path =>
		stat(resolve(path, "package.json"))(stats => stats.isFile(), false)(pkgJsonExists =>
			pkgJsonExists
				? path
				: stat(resolve(path, "node_modules"))(stats => stats.isDirectory(), false)(
						nodeModulesExists => {
							if (nodeModulesExists) return path;
							const parent = dirname(path);
							if (parent === path) return null;
							if (basename(parent) === "node_modules") return path;
							return module.exports(parent)(result => {
								if (result !== parent || !basename(parent).startsWith("@")) {
									return result;
								}
								return path;
							});
						}
				  )
		),
	{ primitive: true }
);
