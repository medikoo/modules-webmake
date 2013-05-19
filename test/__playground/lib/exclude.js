'use strict'

function getC(key) {
    return require('./included/' + key).name;
}

exports.getC = getC;
