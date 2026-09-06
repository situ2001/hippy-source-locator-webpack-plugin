import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('package supports importing and constructing the plugin in CommonJS and ESM', () => {
  for (const moduleType of ['commonjs', 'module']) {
    const loadPlugin = moduleType === 'commonjs'
      ? "const Plugin = require('hippy-source-locator-webpack-plugin');"
      : "import Plugin from 'hippy-source-locator-webpack-plugin';";
    execFileSync(process.execPath, [`--input-type=${moduleType}`, '-e', `
      ${loadPlugin}
      const plugin = new Plugin();
      if (typeof plugin.apply !== 'function') throw new Error('Expected a Webpack plugin');
      if ('injectToUiModule' in Plugin) throw new Error('Unexpected manual injection API');
    `]);
  }
});

test('package keeps runtime and preload entry points private', () => {
  for (const subpath of ['runtime', 'debug-server-register', 'package.json']) {
    assert.throws(
      () => require.resolve(`hippy-source-locator-webpack-plugin/${subpath}`),
      { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
    );
  }
});
