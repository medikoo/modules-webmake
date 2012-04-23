# modules-webmake - Bundle CommonJS/Node.js modules for web browser

It's about organizing JavaScript code for browser same way as we do for Node.js.

If you're not that familiar with it, see plain [specification](http://www.commonjs.org/specs/modules/1.0/) and slides from Warsaw's MeetJS meetup presentation:  
__[JavaScript Modules Done Right](http://www.slideshare.net/medikoo/javascript-modules-done-right)__

## How it works?

Let's say in package named _foo_ we have following individual file modules:

_add.js_

```javascript
module.exports = function() {
  var sum = 0, i = 0, args = arguments, l = args.length;
  while (i < l) sum += args[i++];
  return sum;
};
```

_increment.js_

```javascript
var add = require('./add');
module.exports = function(val) {
  return add(val, 1);
};
```

_program.js_

```javascript
var inc = require('./increment');
var a = 1;
inc(a); // 2
```

Let's pack _program.js_ with all it's dependencies for browser:

	$ webmake program.js build.js

In result we have generated _build.js_ that looks like:

```javascript
(function (modules) {
  // about 60 lines of import/export path resolution logic
}) ({
  "foo": {
    "add.js": function (exports, module, require) {
      module.exports = function () {
        var sum = 0, i = 0, args = arguments, l = args.length;
        while (i < l) sum += args[i++];
        return sum;
      };
    },
    "increment.js": function (exports, module, require) {
      var add = require('./add');
      module.exports = function (val) {
        return add(val, 1);
      };
    },
    "program.js": function (exports, module, require) {
      var inc = require('./increment');
      var a = 1;
     inc(a); // 2
    }
  }
})
("foo/program");
```

When loaded in browser, immediately _program.js_ module is executed

## Installation

	$ npm install -g webmake

## Usage

### From the shell:

	$ webmake <input> <output>

_input_ is path to your initial module that would be executed when script is loaded, and _output_ is path where browser ready file should land.

Additionally you may output modules as [source maps](http://pmuellr.blogspot.com/2011/11/debugging-concatenated-javascript-files.html).

	$ webmake --sourcemap path/to/program-module.js path/to/output.js

It works very well in webkit web inspector but [it's not that well supported by firefox's firebug](http://code.google.com/p/fbug/issues/detail?id=2198)

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

##### output `string`
Path of output file, if you want _webmake_ to create one

##### include `string|Array`
Additional module(s) that need to be included (but due specific reasons can't be picked by parser).

##### sourcemap `boolean`
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

## Tests

Before running tests make sure you've installed project with dev dependencies
`npm install --dev`

	$ npm test
