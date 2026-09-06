import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'acorn';

test('bundled CommonJS is parseable as ES2019', () => {
  const bundleNames = fs.readdirSync('dist').filter(name => name.endsWith('.cjs'));
  assert.deepEqual(bundleNames, ['index.cjs']);

  for (const bundleName of bundleNames) {
    const fileName = path.join('dist', bundleName);
    const source = fs.readFileSync(fileName, 'utf8');
    assert.doesNotThrow(
      () => parse(source, { ecmaVersion: 2019, sourceType: 'script' }),
      `${fileName} contains syntax newer than ES2019`,
    );
  }
});
