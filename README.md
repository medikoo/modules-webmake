# modules-webmake

_Bundle CommonJS/Node.js modules for web browsers._

Webmake allows you to organize JavaScript code for the browser the same way
as you would for Node.js.

For a more in depth look into JavaScript modules and the reason for _Webmake_,
see the slides from my presentation at Warsaw's MeetJS:

**[JavaScript Modules Done Right][slides]**

## How does it work?

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

### Development with Webmake

Currently best way is to use Webmake programmatically and setup a static-file server to generate bundle on each request. Webmake is fast, so it's acceptable approach even you bundle hundreds of modules at once.

You can setup simple static server as it's shown in following example script.  
_It uses also [node-static][] module to serve other static files (CSS, images etc.) if you don't want it, just adjust code up to your needs._

```javascript
// Dependencies:
var createServer = require('http').createServer;
var staticServer = require('node-static').Server;
var webmake      = require('webmake');

// Settings:
// Project path:
var projectPath  = '/Users/open-web-user/Projects/Awesome';
// Public folder path (statics)
var staticsPath  = projectPath + '/public';
// Path to js program file
var programPath = projectPath + '/lib/public/main.js';
// Server port:
var port = 8000;
// Url at which we want to serve generated js file
var programUrl = '/j/main.js';

// Setup statics server
staticServer = new staticServer(staticsPath);

// Initialize http server
createServer(function (req, res) {
  // Respond to request
  req.addListener('end', function () {
    if (req.url === programUrl) {
      // Generate bundle with Webmake

      // Send headers
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        // Do not cache generated bundle
        'Cache-Control': 'no-cache'
      });

      var time = Date.now();
      webmake(programPath, { sourceMap: true }, function (err, content) {
        if (err) {
          console.error("Webmake error: " + err.message);
          // Expose eventual error brutally in browser
          res.end('document.write(\'<div style="font-size: 1.6em; padding: 1em;'
            + ' text-align: left; font-weight: bold; color: red;'
            + ' position: absolute; top: 1em; left: 10%; width: 80%;'
            + ' background: white; background: rgba(255,255,255,0.9);'
            + ' border: 1px solid #ccc;"><div>Could not generate ' + programUrl
            + '</div><div style="font-size: 0.8em; padding-top: 1em">'
            + err.message.replace(/'/g, '\\\'') + '</div></div>\');');
          return;
        }

        // Send script
        console.log("Webmake OK (" + ((Date.now() - time)/1000).toFixed(3) + "s)");
        res.end(content);
      });
    } else {
      // Serve static file
      staticServer.serve(req, res);
    }
  });
}).listen(port);
console.log("Server started");
````

#### Options

```javascript
webmake(inputPath[, options], callback);
```

##### output `string`

Path of output file, if you want _Webmake_ to create one

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

   This is because Webmake will only bundle the version that was called
   first. So in this case package B will end up with version 0.2 instead
   of 0.3.

## Tests [![Build Status](https://secure.travis-ci.org/medikoo/modules-webmake.png?branch=master)](https://secure.travis-ci.org/medikoo/modules-webmake)

    $ npm test

## Contributors

* [@Phoscur](https://github.com/Phoscur) (Justus Maier)
  * Help with source map feature
* [@jaap3](https://github.com/jaap3) (Jaap Roes)
  * Documentation quality improvements

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

[node-static]:
  https://github.com/cloudhead/node-static
  'HTTP static-file server module'
