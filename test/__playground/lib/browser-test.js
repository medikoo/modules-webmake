/* global document */

"use strict";

require("./browser/test");

const styles = document.getElementsByTagName("style");

exports.style = styles[styles.length - 1];

const div = document.body.appendChild(document.createElement("div"));
div.innerHTML = require("./browser/body");

exports.html = div;
