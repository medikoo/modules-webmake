'use strict';

require('./css/test');

var styles = document.getElementsByTagName('style');

module.exports = styles[styles.length - 1];
