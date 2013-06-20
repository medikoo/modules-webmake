'use strict';

require('./browser/test');

var styles = document.getElementsByTagName('style');

exports.style = styles[styles.length - 1];

var div = document.body.appendChild(document.createElement('div'));
div.innerHTML = require('./browser/body');

exports.html = div;
