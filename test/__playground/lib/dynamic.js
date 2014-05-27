#!/usr/bin/env node

'use strict';

var lang = 'pl';

try {
	require('./raz/dwa/' + lang);
} catch (e) {}

exports.foo = 'bar';
