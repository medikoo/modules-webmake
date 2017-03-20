"use strict";

var e = new Error("I should not be taken");
e.code = 'MODULE_EXISTS';
throw e;