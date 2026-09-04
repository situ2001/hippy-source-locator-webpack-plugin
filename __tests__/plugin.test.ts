import assert from 'node:assert/strict';
import path from 'node:path';
import type { Compiler } from 'webpack';
import test from './helpers/test';

const HippySourceLocatorWebpackPlugin = require('../dist/index.cjs') as typeof import('../src/index').default;

function createCompiler(mode = 'development') {
  return {
    context: path.resolve(__dirname, 'fixtures'),
    options: {
      mode,
      entry: { index: ['./src/main.js'] },
      module: {
        rules: [{
          oneOf: [{
            test: /\.jsx?$/,
            use: [{
              loader: '/virtual/node_modules/babel-loader/index.js',
              options: { plugins: [] },
            }],
          }],
        }],
      },
      resolve: { alias: {} },
    },
  };
}

function restoreNodeOptions(value: string | undefined): void {
  if (value === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = value;
}

test('construction is side-effect free', (t) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--trace-warnings';
  try {
    new HippySourceLocatorWebpackPlugin();
    t.is(process.env.NODE_OPTIONS, '--trace-warnings');
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test('failed activation leaves compiler options and process state unchanged', (t) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--trace-warnings';
  const compiler = createCompiler();
  const originalEntry = compiler.options.entry;
  const originalRules = compiler.options.module.rules;
  const originalResolve = compiler.options.resolve;
  const originalPlugins = compiler.options.module.rules[0]!.oneOf[0]!.use[0]!.options.plugins;

  try {
    assert.throws(() => new HippySourceLocatorWebpackPlugin({
      reactModule: '/missing/hippy-react.cjs',
    }).apply(compiler as unknown as Compiler), /Cannot find module/);

    t.is(compiler.options.entry, originalEntry);
    t.is(compiler.options.module.rules, originalRules);
    t.is(compiler.options.resolve, originalResolve);
    t.deepEqual(originalPlugins, []);
    t.is(process.env.NODE_OPTIONS, '--trace-warnings');
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test('production activation is side-effect free', (t) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--trace-warnings';
  const compiler = createCompiler('production');
  try {
    new HippySourceLocatorWebpackPlugin().apply(compiler as unknown as Compiler);
    t.is(process.env.NODE_OPTIONS, '--trace-warnings');
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test('successful activation registers child preload once', (t) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--trace-warnings';
  const compiler = createCompiler();
  const plugin = new HippySourceLocatorWebpackPlugin({
    reactModule: path.resolve(__dirname, 'fixtures/hippy-react.cjs'),
  });
  try {
    plugin.apply(compiler as unknown as Compiler);
    plugin.apply(compiler as unknown as Compiler);
    const registrations = process.env.NODE_OPTIONS?.match(/debug-server-register\.cjs/g) || [];
    t.is(registrations.length, 1);
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test('unsupported entry leaves the complete configuration transaction unchanged', (t) => {
  const compiler = createCompiler() as any;
  compiler.options.entry = 42;
  const originalRules = compiler.options.module.rules;
  const originalResolve = compiler.options.resolve;
  const originalPlugins = compiler.options.module.rules[0]!.oneOf[0]!.use[0]!.options.plugins;

    assert.throws(() => new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, 'fixtures/hippy-react.cjs'),
  }).apply(compiler as unknown as Compiler), /unsupported Webpack entry/);

  t.is(compiler.options.entry, 42);
  t.is(compiler.options.module.rules, originalRules);
  t.is(compiler.options.resolve, originalResolve);
  t.deepEqual(originalPlugins, []);
});

test('configuration transaction supports Webpack rule variants', (t) => {
  const compiler = createCompiler() as any;
  compiler.options.module.rules = [
    { loader: '/virtual/node_modules/babel-loader/index.js', options: { plugins: [] } },
    { use: '/virtual/node_modules/babel-loader/index.js' },
    { rules: [{ use: { loader: '/virtual/node_modules/babel-loader/index.js', options: {} } }] },
    { oneOf: [{ use: [{ loader: '/virtual/node_modules/babel-loader/index.js' }] }] },
  ];

  new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, 'fixtures/hippy-react.cjs'),
  }).apply(compiler as Compiler);

  const configuredRules = compiler.options.module.rules;
  const pluginLists = [
    configuredRules[0].options.plugins,
    configuredRules[1].use.options.plugins,
    configuredRules[2].rules[0].use.options.plugins,
    configuredRules[3].oneOf[0].use[0].options.plugins,
  ];
  t.true(pluginLists.every(plugins => plugins.length === 1
    && /plugin-transform-react-jsx-source/.test(plugins[0])));
});

test('configuration transaction supports Webpack entry variants', async (t) => {
  const configureEntry = (entry: unknown): unknown => {
    const compiler = createCompiler() as any;
    compiler.options.entry = entry;
    new HippySourceLocatorWebpackPlugin({
      debugServer: false,
      reactModule: path.resolve(__dirname, 'fixtures/hippy-react.cjs'),
    }).apply(compiler as Compiler);
    return compiler.options.entry;
  };
  const hasRuntimeFirst = (entry: unknown): boolean => Array.isArray(entry)
    && /runtime-entry\.cjs$/.test(String(entry[0]));

  t.true(hasRuntimeFirst(configureEntry('./src/main.js')));
  t.true(hasRuntimeFirst(configureEntry(['./src/main.js'])));
  const descriptor = configureEntry({ import: './src/main.js' }) as { import: unknown };
  t.true(hasRuntimeFirst(descriptor.import));
  const entries = configureEntry({ app: './src/main.js' }) as { app: unknown };
  t.true(hasRuntimeFirst(entries.app));
  const syncFactory = configureEntry(() => './src/main.js') as () => unknown;
  t.true(hasRuntimeFirst(syncFactory()));
  const asyncFactory = configureEntry(async () => './src/main.js') as () => Promise<unknown>;
  t.true(hasRuntimeFirst(await asyncFactory()));
});

test('plugin injects source transform, runtime entry, and resolved React module', (t) => {
  const compiler = createCompiler();
  const originalBabelOptions = compiler.options.module.rules[0]!.oneOf[0]!.use[0]!.options;
  new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, 'fixtures/hippy-react.cjs'),
  }).apply(compiler as unknown as Compiler);

  const babelOptions = compiler.options.module.rules[0]!.oneOf[0]!.use[0]!.options;
  t.deepEqual(originalBabelOptions.plugins, []);
  t.true(babelOptions.plugins.some(plugin => /plugin-transform-react-jsx-source/.test(plugin)));
  t.true(/runtime-entry\.cjs$/.test(compiler.options.entry.index[0]!));
  // eslint-disable-next-line no-underscore-dangle
  const reactAlias = (compiler.options.resolve.alias as Record<string, unknown>)
    .__HIPPY_SOURCE_LOCATOR_UI_MODULE__$;
  t.is(reactAlias, path.resolve(__dirname, 'fixtures/hippy-react.cjs'));
});

test('plugin does not inject twice', (t) => {
  const compiler = createCompiler();
  const plugin = new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, 'fixtures/hippy-react.cjs'),
  });
  plugin.apply(compiler as unknown as Compiler);
  plugin.apply(compiler as unknown as Compiler);

  const babelPlugins = compiler.options.module.rules[0]!.oneOf[0]!.use[0]!.options.plugins;
  t.is(babelPlugins.filter(item => /plugin-transform-react-jsx-source/.test(item)).length, 1);
  t.is(compiler.options.entry.index.filter(item => /runtime-entry\.cjs$/.test(item)).length, 1);
});

test('plugin is disabled in production', (t) => {
  const compiler = createCompiler('production');
  new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, 'fixtures/hippy-react.cjs'),
  }).apply(compiler as unknown as Compiler);

  t.deepEqual(compiler.options.entry, { index: ['./src/main.js'] });
  t.deepEqual(compiler.options.module.rules[0]!.oneOf[0]!.use[0]!.options.plugins, []);
});

test('debug-server integration can be disabled', (t) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  const compiler = createCompiler();
  new HippySourceLocatorWebpackPlugin({ debugServer: false })
    .apply(compiler as unknown as Compiler);

  t.is(process.env.NODE_OPTIONS, oldNodeOptions);
});
