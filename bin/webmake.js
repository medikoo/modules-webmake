#!/usr/bin/env node

"use strict";

require("log-node")({ defaultNamespace: "webmake" });

const count       = require("es5-ext/object/count")
    , { resolve } = require("path")
    , log         = require("log").get("webmake")
    , webmake     = require("..");

const { isArray } = Array, { now } = Date;

const optimist = require("optimist").usage("Usage: $0 [options] [<input>] [<output>]", {
	"name": { string: true, description: "Expose program in your namespace with given name" },
	"amd": { boolean: true, description: "Expose bundle as AMD module" },
	"cjs": { boolean: true, description: "Expose bundle as CJS module" },
	"ext": { string: true, description: "Optional extensions" },
	"ignore-errors": { boolean: true, description: "Ignore unparsable require calls" },
	"use-strict": { boolean: true, description: "Enforce strict mode" },
	"include": {
		string: true,
		description:
			"Additional module(s) that should be included (and are not picked by the parser)"
	},
	"help": { boolean: true, desription: "Show this help" },
	"sourcemap": { boolean: true, description: "Include source maps" }
});

const { argv } = optimist, options = {};

let [input] = argv._;

if (argv.help) {
	process.stdout.write(`${ optimist.help() }\n`);
	process.exit(0);
}

if (!input) {
	options.stream = process.stdin;
	process.stdin.resume();
	input = resolve(process.cwd(), ":stream:.js");
}

if (argv.include) {
	options.include = argv.include;
	if (!isArray(options.include)) {
		options.include = [options.include];
	}
}

options.ext = argv.ext;
options.sourceMap = argv.sourcemap;
options.useStrict = argv["use-strict"];
options.ignoreErrors = argv["ignore-errors"];
if (argv._[1]) [, options.output] = argv._;

let time = now();
webmake(input, options).done(parser => {
	time = now() - time;
	if (!options.output) {
		process.stdout.write(parser);
		return;
	}
	log.notice(
		"Done [%d modules from %d packages in %ds]", parser.modulesFiles.length,
		count(parser.packages), (time / 1000).toFixed(2)
	);
});
