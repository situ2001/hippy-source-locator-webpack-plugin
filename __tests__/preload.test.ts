import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Node preload adapter installs middleware in a debug-server child', () => {
  const result = spawnSync(process.execPath, [
    '--require',
    path.resolve('dist/debug-server-register.cjs'),
    path.resolve('__tests__/fixtures/hippy-debug'),
  ], {
    cwd: path.resolve('__tests__/fixtures/debug-project'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
