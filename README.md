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

### Programmatically:

	var webmake = require('webmake');
	webmake('/path/to/program-module.js', function (err, source) {
		// Do whatever you need with generated source
	});

## Limitations

Application calculates dependencies by reading require paths from source code

### Only plain written paths work

Following won't work:

	require('./path/' + 'rest/of/path');
	require(readFromVariable);
	require(generatePath());

### Supported are relative paths and outer packages paths

This will work:

	require('./module-in-same-folder');
	require('./module/path/deeper');
	require('../../module-path-up'); // unless it doesn't go out of current package scope
	require('other-package');
	require('other-package/lib/some-module);

### Absolute paths won't work (TODO)

	require('/Users/foo/projects/awesome/my-module');

### Commented requires or requires found in strings will be picked up (TODO)

Current dependency parsing is rudimentary, unfortunately following will be picked up:

	// require('./well/i/dont/need/that')
	var generatedCode = 'var s = require("used/somewhere/else");';

stay tuned, it will be fixed.

### Different versions of same package will colide (TODO)

Let's say, required package A uses version 0.2 of package C and required package B uses version 0.3 of same package, it will most likely crash. Currently webmake will take C in version that was called first and will give it to both A and B.

## TODO

* Right dependency parsing (probably with help of UglifyJS)
* Absolute path lookups
* Support different package versions
* Compiled version (no boilerplate code overhead, trimed requires)
