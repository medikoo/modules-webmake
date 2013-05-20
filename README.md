# modules-webmake

_Bundle CommonJS/Node.js modules for web browsers._

Webmake allows you to organize JavaScript code for the browser the same way
as you would for Node.js.

For a more in depth look into JavaScript modules and the reason for _Webmake_,
see the slides from my presentation at Warsaw's MeetJS: [__JavaScript Modules Done Right__][slides]

Webmake naturally bundles _.js_ and _.json_ files, but this support can extended to other formats with __[custom extensions](#extensions)__

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

    $ webmake program.js bundle.js

The generated file _bundle.js_ now contains the following:

```javascript
(function (modules) {
  // about 60 lines of import/export path resolution logic
})({
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
})("foo/program");
```

When loaded in browser, _program.js_ module is executed immediately.

## Installation

    $ npm install -g webmake

## Usage

### From the shell:

    $ webmake [options] <input> <output>

__input__ - Path to the initial module that should be executed when script is loaded.  
__output__ - Filename at which browser ready bundle should be saved

#### Options

##### name `string`

Name at which program should be exposed in your namespace. Technically just assigns exported module to global namespace.

##### amd `string`

Expose bundle as AMD module. If used together with _[name](#name-string)_ option, module will be defined with provided name.

##### include `string`

Additional module(s) that should be included but due specific reasons are
not picked by parser (can be set multiple times)

##### ext `string`

Additional extensions(s) that should be used for modules resolution from custom formats e.g. _coffee-script_ or _yaml_.  
See [extensions](#extensions) section for more info.

##### sourceMap `boolean`

Include [source maps][], for easier debugging. Source maps work very well in WebKit and Chrome's web inspector. Firefox's Firebug however has some [issues][firebug issue].

##### cache `boolean` _programmatical usage only_

Cache files content and its calculated dependencies. On repeated request only modified files are re-read and parsed.  
Speeds up re-generation of Webmake bundle, useful when Webmake is bound to server process, [see below example](#development-with-webmake).  
Highly recommended if [extensions](#extensions) are used.
Defaults to _false_.

### Programmatically:

```javascript
webmake(programPath[, options][, callback]);
```

`webmake` by default returns generated source to callback, but if _output_ path is provided as one of the options, then source will be automatically saved to file

### Development with Webmake

Currently best way is to use Webmake programmatically and setup a static-file server to generate bundle on each request. Webmake is fast, so it's acceptable approach even you bundle hundreds of modules at once.

You can setup simple static server as it's shown in following example script.  
_Example also uses [node-static][] module to serve other static files (CSS, images etc.) if you don't need it, just adjust code up to your needs._

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
  req.on('end', function () {
    if (req.url === programUrl) {
      // Generate bundle with Webmake

      // Send headers
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        // Do not cache generated bundle
        'Cache-Control': 'no-cache'
      });

      var time = Date.now();
      webmake(programPath, { sourceMap: true, cache: true }, function (err, content) {
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

### Using Webmake with Express or Connect

See [webmake-middleware](https://github.com/gillesruppert/webmake-middleware) prepared by [Gilles Ruppert](http://latower.com/).

### Using Webmake with Grunt

See [grunt-webmake](https://github.com/sakatam/grunt-webmake) prepared by [Sakata Makoto](https://github.com/sakatam).

### Extensions

#### Available extensions

* __CoffeeScript - [webmake-coffee](https://github.com/medikoo/webmake-coffee)__
* __YAML - [webmake-yaml](https://github.com/medikoo/webmake-yaml)__

#### Using extensions with Webmake

Install chosen extension:

_EXT should be replaced by name of available extension of your choice_.

    $ npm install webmake-EXT

If you use global installation of Webmake, then extension also needs to be installed globally:

    $ npm install -g webmake-EXT

When extension is installed, you need to ask Webmake to use it:

    $ webmake --ext=EXT program.js bundle.js

Same way if used programmatically:

```javascript
webmake(inputPath, { ext: 'EXT' }, cb);
```

Multiple extensions can be used together:

    $ webmake --ext=EXT --ext=EXT2 program.js bundle.js

Programmatically:

```javascript
webmake(inputPath, { ext: ['EXT', 'EXT2'] }, cb);
```

#### Writing an extension for a new format

Prepare a `webmake-*` NPM package _(replace '*' with name of your extension)_, where main module is configured as in following example:

```javascript
// Define a file extension of a new format, can be an array e.g. ['xy', 'xyz']
exports.extension = 'xyz';

// Define a compile function, that for given source code, produces valid body of a JavaScript module:
exports.compile = function (source, options) {
  // Return plain object, with compiled body assigned to `code` property.
  // e.g. to compile JSON file to JavaScript module, compilation is as follows:
  return { code: 'module.exports = ' + source.trim() + ';' };

  // If custom format provides a way to calculate a source map and `sourceMap` options is on
  // it's nice to generate it:
  var data, map, code;
  if (options.sourceMap) {
    data = compile(source, { sourceMap: true });

    // Include original file in the map.
    map = JSON.parse(data.sourceMap);
    map.sourcesContent = [source];
    map = JSON.stringify(map);

    code = data.code + '\n//@ sourceMappingURL=data:application/json;base64,' +
      new Buffer(map).toString('base64') + '\n';

    return { code: code };
  }
};

// If given format doesn't expose any `require` calls in generated code
// (which is natural for formats like JSON or YAML).
// Indicate that there's no need to look for `require` calls in it,
// it will prevent bundler from doing obsolete work.
exports.noDependencies = true;
```

Publish it and refer to [Using extensions](#Using-extensions-with-webmake) section for usage instructions.  
Finally if everything works, notify me, so I can update this document with link to your extension.

## Current limitations of Webmake

The application calculates dependencies via static analysis of source code
(with the help of the [find-requires][] module). So in some edge cases
not all require calls can be found. You can workaround that with help
of [`include` option](#include-stringarray)

Only relative paths and outer packages paths are supported, following will work:

```javascript
require('./module-in-same-folder');
require('./module/path/deeper');
require('./some/very/very/very/long' +
'/module/path');
require('../../module-path-up'); // unless it doesn't go out of package scope
require('other-package');
require('other-package/lib/some-module');
```

But this won't:

```javascript
require('/Users/foo/projects/awesome/my-module');
```

Different versions of same package will collide:  
Let's say, package A uses version 0.2 of package C and package B uses version 0.3 of the same package. If both package A and B are required, package B will most likely end up buggy. This is because webmake will only bundle the version that was called first. So in this case package B will end up with version 0.2 instead of 0.3.

## Tests [![Build Status](https://api.travis-ci.org/medikoo/modules-webmake.png?branch=master)](https://travis-ci.org/medikoo/modules-webmake)

    $ npm test

## Proud list of SPONSORS!

#### [@puzrin](https://github.com/Phoscur) (Vitaly Puzrin) member of [Nodeca](https://github.com/nodeca)
Vitaly pushed forward development of support for _JSON_ files, [extensions functionality](#extensions), along with [webmake-yaml](https://github.com/medikoo/webmake-yaml) extension. Vitaly is a member of a team that is behind [js-yaml](https://github.com/nodeca/js-yaml) JavaScript YAML parser and dumper, and powerful social platform [Nodeca](http://dev.nodeca.com/). Big Thank You Vitaly!

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
