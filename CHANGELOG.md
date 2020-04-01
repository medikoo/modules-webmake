# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.1.2](https://github.com/medikoo/modules-webmake/compare/v1.1.1...v1.1.2) (2020-04-01)

### Bug Fixes

- Fix scoped packages handling when bundling on Windows ([fc7fc8b](https://github.com/medikoo/modules-webmake/commit/fc7fc8b1d97cd1522f016dee84751f7831d307f5)) ([Mariusz Nowak](https://github.com/medikoo))

### [1.1.1](https://github.com/medikoo/modules-webmake/compare/v1.1.0...v1.1.1) (2020-03-31)

### Bug Fixes

- Fix support for scoped dependencies ([543a3a5](https://github.com/medikoo/modules-webmake/commit/543a3a5b93a26db4f56c6bfb0b9762ecb19db949)) ([Mariusz Nowak](https://github.com/medikoo))

## [1.1.0](https://github.com/medikoo/modules-webmake/compare/v1.0.0...v1.1.0) (2019-11-29)

### Features

- `cjs` option ([4fe7fbc](https://github.com/medikoo/modules-webmake/commit/4fe7fbcb8cdc1fb27eb96e4296b2a1b65faec89f))

## [1.0.0](https://github.com/medikoo/modules-webmake/compare/v0.4.0...v1.0.0) (2019-11-29)

### ⚠ BREAKING CHANGES

- Binary file was renamed from bin/webmake to bin/webmake.js
  (but it doesn't affect `webmake` command)

### Features

- Expose parent env require on `require.fromParentEnvironment` ([fcfe2c1](https://github.com/medikoo/modules-webmake/commit/fcfe2c191d1abf5b8d97bdbe0571dc2202bb0ba7))
- Reconfigure logging with 'log' utility ([a53f9a9](https://github.com/medikoo/modules-webmake/commit/a53f9a9edc9c3e8af4ab13c09d219ff6f8cfd3ef))

* Add '.js' extension to binary ([0dcdfe5](https://github.com/medikoo/modules-webmake/commit/0dcdfe584d1d099d1b06041b8c3348dba76a3f11))

<a name="0.4.0"></a>

# [0.4.0](https://github.com/medikoo/modules-webmake/compare/v0.3.43...v0.4.0) (2018-08-08)

### Bug Fixes

- override externals resolution in Node.js v10 ([4e59857](https://github.com/medikoo/modules-webmake/commit/4e59857))

### Chores

- use caret to describe version ranges ([64e6206](https://github.com/medikoo/modules-webmake/commit/64e6206))

### BREAKING CHANGES

- Drop support for Node.js v4 and below

## Old changelog

See `CHANGES` file
