import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.ts',
  transform: { target: 'es2019' },
  output: {
    file: 'dist/index.cjs',
    format: 'cjs',
    sourcemap: false,
    exports: 'default',
  },
});
