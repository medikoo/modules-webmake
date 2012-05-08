# modules-webmake

_Bundle CommonJS/Node.js modules for web browsers._

Webmake allows you to organize JavaScript code for the browser the same way
as you would for Node.js.

For a more in depth look into JavaScript modules and the reason for _webmake_,
see the slides from my presentation at Warsaw's MeetJS:

**[JavaScript Modules Done Right][slides]**

## How does it works?

Let's say in package named _foo_ you have following individual module files:

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

Let's pack _program.js_ with all it's dependencies so it will work in browsers:

    $ webmake program.js build.js

The generated file _build.js_ now contains the following:

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

When loaded in browser, _program.js_ is immediately executed.

## Installation

    $ npm install -g webmake

## Usage

### From the shell:

    $ webmake <input> <output>

_input_ is the path to the initial module that should be executed when
script is loaded.  
_output_ is the path to which the bundled browser ready code is written.

Additionally you may output modules with [source maps][], for easier debugging.

    $ webmake --sourcemap <input> <output>

Source maps work very well in WebKit and Chrome's web inspector. Firefox's Firebug
however has some [issues][firebug issue].

### Programmatically

Webmake can also be used programmatically. For example to create a server that
builds a fresh bundle on each request.

```javascript
var http = require('http'),
    webmake = require('webmake'),
    server;
 
server = http.createServer(function (request, response) {
    webmake('program.js', {'sourceMap': true}, function (err, src) {
        if (err) {
            response.writeHead(500, {'Content-Type': 'text/plain'});
            response.end(err);
        } else {
            response.writeHead(200, {'Content-Type': 'application/javascript'});
            response.end(src);
        }
    });
});

server.listen(8000);
````

#### Options

```javascript
webmake(inputPath[, options], callback);
```

##### output `string`

Path of output file, if you want _webmake_ to create one

##### include `string|Array`

Additional module(s) that need to be included (but due specific reasons can't
be picked by parser).

##### sourceMap `boolean`

Include [source maps][].

## Limitations

The application calculates dependencies via static analysis of source code
(with the help of the [find-requires][] module). So in some edge cases
not all require calls can be found.

Only relative paths and outer packages paths supported, so this will work:

```javascript
require('./module-in-same-folder');
require('./module/path/deeper');
require('./some/very/very/very/long' +
'/module/path');
require('../../module-path-up'); // unless it goes out of package scope
require('other-package');
require('other-package/lib/some-module');
```

But this won't work:

```javascript
require('/Users/foo/projects/awesome/my-module');
```

## Known issues

 * Absolute file paths in require calls don't work
 * Different versions of same package will collide

   Let's say, package A uses version 0.2 of package C and package B uses
   version 0.3 of the same package. If both package A and B are required,
   package B will most likely end up buggy.

   This is because webmake will only bundle the version that was called
   first. So in this case package B will end up with version 0.2 instead
   of 0.3.

## Tests

    $ npm test

## Contributors

	* Justus Maier (@Phoscur)
	* Jaap Roes (@jaap3)

[slides]:
  http://www.slideshare.net/medikoo/javascript-modules-done-right
  'JavaScript Modules Done Right on SlideShare'

[source maps]:
  http://pmuellr.blogspot.com/2011/11/debugging-concatenated-javascript-files.html
  'Debugging concatenated JavaScript files'

[firebug issue]:
  http://code.google.com/p/fbug/issues/detail?id=2198
  'Issue 2198:	@sourceURL doesn't work in eval() in some cases'

[find-requires]:
  https://github.com/medikoo/find-requires
  'find-requires: Find all require() calls'