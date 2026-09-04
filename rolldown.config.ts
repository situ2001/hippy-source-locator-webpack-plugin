import { defineConfig } from 'rolldown';

const output = (name: string, exports: 'auto' | 'default' = 'auto') => ({
  file: `dist/${name}.cjs`,
  format: 'cjs' as const,
  sourcemap: false,
  exports,
});

const transform = { target: 'es2019' as const };

export default defineConfig([
  {
    input: 'src/index.ts',
    transform,
    output: output('index', 'default'),
  },
  {
    input: 'src/runtime.ts',
    transform,
    output: output('runtime'),
  },
  {
    input: 'src/runtime-entry.ts',
    transform,
    external: ['__HIPPY_SOURCE_LOCATOR_UI_MODULE__'],
    output: output('runtime-entry'),
  },
  {
    input: 'src/debug-server-register.ts',
    transform,
    output: output('debug-server-register'),
  },
]);
