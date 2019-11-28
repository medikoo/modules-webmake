#!/usr/bin/env node

"use strict";

const lang = "pl";

try { require(`./raz/dwa/${ lang }`); }
catch (e) {}

exports.foo = "bar";
