import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import webpack from 'webpack';

const Plugin = require('../dist/index.cjs') as typeof import('../src/index').default;

test('single plugin bundle injects a standalone runtime before the app entry', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-locator-webpack-'));
  try {
    writeFileSync(path.join(directory, 'react.js'), `
      exports.UIManagerModule = {
        getNodeById: id => id === 7 ? {
          type: 'View',
          _debugSource: { fileName: '/app/Demo.jsx', lineNumber: 12 }
        } : null
      };
    `);
    writeFileSync(path.join(directory, 'app.js'), `
      global.result = global.__HIPPY_DEVTOOLS__.inspectNode(7);
    `);
    const compiler = webpack({
      mode: 'development',
      context: directory,
      target: 'web',
      devtool: false,
      entry: './app.js',
      output: { path: path.join(directory, 'dist'), filename: 'app.js' },
      module: { rules: [{ test: /\.js$/, loader: require.resolve('babel-loader') }] },
      plugins: [new Plugin({
        debugServer: false,
        reactModule: path.join(directory, 'react.js'),
      })],
    });
    assert.ok(compiler);
    try {
      await new Promise<void>((resolve, reject) => {
        compiler.run((error, stats) => {
          if (error) return reject(error);
          if (!stats || stats.hasErrors()) return reject(new Error(stats?.toString()));
          resolve();
        });
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        compiler.close(error => error ? reject(error) : resolve());
      });
    }
    const context = { result: undefined as { source: { fileName: string; lineNumber: number } } | undefined };
    vm.runInNewContext(readFileSync(path.join(directory, 'dist/app.js'), 'utf8'), context);
    assert.equal(context.result?.source.fileName, '/app/Demo.jsx');
    assert.equal(context.result?.source.lineNumber, 12);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
