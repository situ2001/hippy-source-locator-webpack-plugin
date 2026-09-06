import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { injectToUiModule } from '../js-runtime/runtime';

export function createRuntimeEntry(): string {
  const source = `(${injectToUiModule.toString()})(require('__HIPPY_SOURCE_LOCATOR_UI_MODULE__').UIManagerModule);\n`;
  const hash = createHash('sha256').update(source).digest('hex');
  const directory = path.join(tmpdir(), 'hippy-source-locator', hash);
  const entry = path.join(directory, 'runtime-entry.cjs');
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(entry, source, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return entry;
}
