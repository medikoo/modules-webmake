"use strict";

const startsWith          = require("es5-ext/string/#/starts-with")
    , lock                = require("es5-ext/function/#/lock")
    , { promisify }       = require("deferred")
    , fs                  = require("fs")
    , { resolve }         = require("path")
    , { runInNewContext } = require("vm")
    , browserContext      = require("./lib/browser/__tad").context;

const readFile = promisify(fs.readFile)
    , unlink = promisify(fs.unlink)
    , pg = `${ __dirname }/__playground`;

module.exports = {
	""(t, a, d) {
		const input = `${ pg }/lib/program.js`
		    , output = `${ pg }/build.js`
		    , options = { include: `${ pg }/lib/included`, ignore: [resolve(pg, "not-taken.js")] };
		t = promisify(t);
		t(
			input, options
		)(result => {
			const program = runInNewContext(result, {});
			a(program.x.name, "x", "Same path require");
			a(program.x.getZ().name, "z", "Deferred call");
			a(
				program.x.getZ(), program.x.getZ(),
				"Requiring same object twice, should return same object"
			);
			a(program.y.z.name, "z", "Require within required module");
			a(program.y.z.y.name, "y", "Circular dependency");
			a(program.dirjs, "DIR.JS", "Directory with '.js' extension");
			a(program.indexed.name, "indexed", "Folder index");
			a(program.included.a.name, "included.a", "Manually included #1");
			a(program.included.b.name, "included.b", "Manually included #2");
			a(program.outer.name, "outer", "Require module up tree");
			a(program.outerSubIndex.name, "outer-index", "Require index from sibling directory");
			a(program.pathFile.name, "path.js", "Dir/file collision: file");
			a(program.pathDir.name, "path", "Dir/file collision: dir");
			a(program.pathIndex.name, "path", "Dir/file collision: dir/index");
			a(program.externalByIndex.name, "external-by-index", "External package by index");
			a(program.scopedByIndex.name, "scoped-by-index", "External scoped package by index");

			a(program.commonPathPart.id, "sub-longer-bar", "Common path part: main");
			a(program.commonPathPart.sub.id, "sub-foo", "Common path part: outer");
			a(program.commonPathPart.subInner.id, "sub-inner-inner", "Common path part: outer #2");
			a(
				program.commonPathPart.subInner.outer.id, "sub-longer-other",
				"Common path part: outer #3"
			);
			a(
				program.commonPathPart.sub.subOuter.id, "sub-longer-inner-other",
				"Common path part: outer #5"
			);
			a(
				program.commonPathPart.sub.subOuter.outer.id, "sub-inner-other",
				"Common path part: outer #4"
			);

			a(program.commonRootPathPart.id, "sub-longer-bar", "Common path part: main");
			a(program.commonRootPathPart.sub.id, "sub-foo", "Common path part: outer");
			a(
				program.commonRootPathPart.subInner.id, "sub-inner-inner",
				"Common root path part: outer #2"
			);
			a(program.outerId, "__playground/lib/sub/inner/inner.js", "Inner module id");
			a(
				program.commonRootPathPart.subInner.outer.id, "sub-longer-other",
				"Common root path part: outer #3"
			);
			a(
				program.commonRootPathPart.sub.subOuter.id, "sub-longer-inner-other",
				"Common root path part: outer #5"
			);
			a(
				program.commonRootPathPart.sub.subOuter.outer.id, "sub-inner-other",
				"Common root path part: outer #4"
			);

			a(program.pathOther.name, "path/other", "Dir/file collision: other");
			a(program.pathOther.index.name, "path", "'.' - index require");
			a(program.pathOther.indexSlash.name, "path", "'./' - index require (slash)");
			a(program.pathOther.parentIndex, "main.index", "'..' - parent index");
			a(program.pathOther.parentIndexSlash, "main.index", "'../' - parent index (slash)");
			a(program.nlComment, "nlComment", "New line / Comment");
			a(program.external.other.name, "external-other", "Require module from other package");
			a(program.external.other.main, program.external.main, "Require dir by package.json");
			a(
				program.external.main.name, "external-main",
				"Require main module from other package"
			);
			a(program.external.main.modId, "test/lib/chosen-one.js", "External package id");
			a(program.external.main.module.name, "module", "Require module within other package");
			a(
				program.external.noMain.name, "no-main",
				"Require from package that doesn't have main module"
			);
			a(program.nodeshim, "path for web");
			a.deep(
				program.json,
				{ "raz": 0, "dwa": "trzy", "pięć": false, "cztery": null, "osiem:": undefined },
				"JSON"
			);
			a(program.modId, "__playground/lib/program.js", "Module id");

			a(program.circularOther, "circTest", "Partially broken dependecy test");

			options.output = output;
			return t(input, options)(lock.call(readFile, output, "utf8"))(content => {
				a(result, content, "Write to file");
				return unlink(output);
			});
		}).done(d, d);
	},
	"No includes"(t, a, d) {
		const input = `${ pg }/lib/x.js`;
		t = promisify(t);
		t(input)(result => {
			const program = runInNewContext(result, {}, input);
			a(program.name, "x", "Same path require");
			a(program.getZ().name, "z", "External name");
		}).done(d, d);
	},
	"Other type includes"(t, a, d) {
		const input = `${ pg }/lib/other-type-includes.js`
		    , options = { include: `${ pg }/includes` };
		t = promisify(t);
		t(
			input, options
		)(result => {
			const program = runInNewContext(result, browserContext, input);
			a(program.html, "<div>HTML</div>\n", "Same path require");
		}).done(d, d);
	},
	"Unresolved path"(t, a, d) {
		const input = `${ pg }/././lib/x.js`;
		t = promisify(t);
		t(input)(result => {
			const program = runInNewContext(result, {}, input);
			a(program.name, "x", "Same path require");
			a(program.getZ().name, "z", "External name");
		}).done(d, d);
	},
	// Workaround ESLint bug: https://github.com/eslint/eslint/issues/12619
	// eslint-disable-next-line quote-props
	"Dynamic": {
		Error(t, a, d) {
			const input = `${ pg }/lib/dynamic.js`;
			t(input)(a.never, e => { a(e.code, "DYNAMIC_REQUIRE"); }).done(d, d);
		},
		Ignored(t, a, d) {
			const input = `${ pg }/lib/dynamic.js`;
			t(input, { ignoreErrors: true })(result => {
				const program = runInNewContext(result, {}, input);
				a(program.foo, "bar");
			}, a.never).done(d, d);
		}
	},
	"Error on native"(t, a, d) {
		t(`${ pg }/require-native.js`, err => {
			a.ok(startsWith.call(err.message, "Cannot require"));
			d();
		});
	},
	"Ignore error on native"(t, a, d) {
		t(`${ pg }/require-native.js`, { ignoreErrors: true }, (err, data) => {
			a(err, null);
			if (typeof process === "undefined") {
				d();
				return;
			}
			const program = runInNewContext(data, { require });
			a(program.fs, require("fs"), "Fallback to environment require");
			d();
		});
	},
	"Enforce strict"(t, a, d) {
		const input = `${ pg }/enforce-strict.js`;
		t(input, { useStrict: true })(result => {
			const program = runInNewContext(result, {}, input);
			a(program, undefined);
		}).done(d, d);
	},
	"Expose as CJS"(t, a, d) {
		const input = `${ pg }/outer.js`;
		t(input, { cjs: true })(result => {
			const module = { exports: {} };
			runInNewContext(result, { module }, input);
			a(module.exports.name, "outer");
		}).done(d, d);
	}
};
