'use strict';

exports.name = 'path/other';
exports.index = require('.');
exports.indexSlash = require('./');
exports.parentIndex = require('..');
exports.parentIndexSlash = require('../');
