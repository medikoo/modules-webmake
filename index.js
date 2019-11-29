"use strict";

const contains             = require("es5-ext/array/#/contains")
    , isFunction           = require("es5-ext/function/is-function")
    , some                 = require("es5-ext/object/some")
    , deferred             = require("deferred")
    , { extname, resolve } = require("path")
    , stat                 = deferred.promisify(require("fs").stat)
    , readFile             = require("fs2/read-file")
    , writeFile            = require("fs2/write-file")
    , readdir              = require("fs2/readdir")
    , createParser         = require("./lib/parser");

const { now } = Date
    , { stringify } = JSON
    , templatePath = resolve(__dirname, "lib/webmake.tpl")
    , separator = process.env.OS === "Windows_NT" ? "/[\\\\/]/" : "'/'";

const filesAtPath = function (path) {
	return stat(path)(stats => {
		if (stats.isFile()) return [path];
		if (stats.isDirectory()) {
			return readdir(path, { depth: Infinity, type: { file: true } })(data =>
				data.map(file => resolve(path, file))
			);
		}
		return [];
	});
};

module.exports = function (input, options, cb) {
	if (isFunction(options)) {
		cb = options;
		options = {};
	} else {
		options = Object(options);
	}
	const time = now();
	const parser = createParser(options);
	const promise = parser
		.readInput(input, options)(path =>
			deferred.map([].concat(options.include || []), inputPath => {
				inputPath = resolve(String(inputPath));
				return filesAtPath(inputPath)
					.invoke("filter", filename => {
						const ext = extname(filename);
						if (ext === ".js") return true;
						if (ext === ".json") return true;
						if (ext === ".css") return true;
						if (ext === ".html") return true;
						return some(parser.extNames, data => contains.call(data, ext));
					})
					.map(parser.readInput, parser);
			})(() => readFile(templatePath, "utf-8"))(tpl => {
				let src = `${
					tpl
						.replace("SEPARATOR", separator)
						.replace("EXTENSIONS", stringify(parser.extNames))
				}(${ parser.toString() })(${ stringify(path) });\n`;
				if (options.name && options.amd) {
					src = `${
						src.replace(
							"(function",
							`define("${ options.name }", function () { return (function`
						)
					}});\n`;
				} else if (options.name) {
					src = src.replace("(function", `window.${ options.name } = (function`);
				} else if (options.cjs) {
					src = src.replace("(function", "module.exports = (function");
				} else if (options.amd) {
					src = `${
						src.replace("(function", "define(function () { return (function")
					}});\n`;
				}
				return options.output
					? writeFile(resolve(String(options.output)), src)(parser)
					: src;
			})
		)
		.cb(cb);
	promise.time = now() - time;
	promise.parser = parser;
	return promise;
};
