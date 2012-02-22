# modules-webmake - Bundle CommonJS modules for web browser

It's about organizing JavaScript code for browser same way as we do for Node.js.
__Modules rocks__

If you're not that familiar with it (yet), see spec:
http://www.commonjs.org/specs/modules/1.0/

## Installation

	$ npm install -g webmake

## Usage

### From the shell:

	$ webmake path/to/program-module.js path/to/output.js

Program module is the main file in which you require needed stuff and make use of it.

Optionally you may output modules as [source maps](http://pmuellr.blogspot.com/2011/11/debugging-concatenated-javascript-files.html).

	$ webmake --sourcemap path/to/program-module.js path/to/output.js

It works very well in webkit web inspector but [it's not that well supported by firebug](http://code.google.com/p/fbug/issues/detail?id=2198)

### Programmatically:

```javascript
var webmake = require('webmake');
webmake('/path/to/program-module.js', function (err, source) {
	if (err) {
		// handle eventual error
	}
	// Do whatever you need with generated source
});
````

#### Options:

You can pass additional options:

```javascript
webmake(inputPath[, options], callback);
```

##### `output: string`
Path of output file, if you want _webmake_ to create one

##### `include: string|Array`
Additional module(s) that need to be included (but due specific reasons can't be picked by parser).

##### `sourcemap: boolean`
Generate [source maps](http://pmuellr.blogspot.com/2011/11/debugging-concatenated-javascript-files.html).

## Limitations

Application calculates dependencies via static analysis of source code (with help of [find-requires](https://github.com/medikoo/find-requires) module)

### Supported are relative paths and outer packages paths

This will work:

	require('./module-in-same-folder');
	require('./module/path/deeper');
	require('./some/very/very/very/long' +
		'/module/path');
	require('../../module-path-up'); // unless it doesn't go out of current package scope
	require('other-package');
	require('other-package/lib/some-module);

### Absolute paths won't work (TODO)

	require('/Users/foo/projects/awesome/my-module');

### Different versions of same package will colide (TODO)

Let's say, required package A uses version 0.2 of package C and required package B uses version 0.3 of same package, it will most likely crash. Currently webmake will take C in version that was called first and will give it to both A and B.

## Tests [![Build Status](https://secure.travis-ci.org/medikoo/modules-webmake.png?branch=master)](https://secure.travis-ci.org/medikoo/modules-webmake)

Before running tests make sure you've installed project with dev dependencies
`npm install --dev`

	$ npm test
