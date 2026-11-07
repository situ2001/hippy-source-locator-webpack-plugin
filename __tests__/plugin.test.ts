import type SourceLocatorPlugin from "../src/index";
import type { Compiler } from "webpack";

import assert from "node:assert/strict";
import path from "node:path";

import test from "./helpers/test";

const HippySourceLocatorWebpackPlugin = require("../dist/index.cjs") as typeof SourceLocatorPlugin;

interface BabelLoaderFixture {
  loader: string;
  options: { plugins: string[] };
}

interface CompilerFixture {
  context: string;
  options: {
    mode: string;
    entry: { index: string[] };
    module: {
      rules: [{ oneOf: [{ test: RegExp; use: [BabelLoaderFixture] }] }];
    };
    resolve: { alias: Record<string, unknown> };
  };
}

function createCompiler(mode = "development"): CompilerFixture {
  return {
    context: path.resolve(__dirname, "fixtures"),
    options: {
      mode,
      entry: { index: ["./src/main.js"] },
      module: {
        rules: [
          {
            oneOf: [
              {
                test: /\.jsx?$/,
                use: [
                  {
                    loader: "/virtual/node_modules/babel-loader/index.js",
                    options: { plugins: [] },
                  },
                ],
              },
            ],
          },
        ],
      },
      resolve: { alias: {} },
    },
  };
}

function restoreNodeOptions(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.NODE_OPTIONS;
  } else {
    process.env.NODE_OPTIONS = value;
  }
}

test("construction is side-effect free", (context) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = "--trace-warnings";
  try {
    new HippySourceLocatorWebpackPlugin();
    context.is(process.env.NODE_OPTIONS, "--trace-warnings");
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test("failed activation leaves compiler options and process state unchanged", (context) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = "--trace-warnings";
  const compiler = createCompiler();
  const originalEntry = compiler.options.entry;
  const originalRules = compiler.options.module.rules;
  const originalResolve = compiler.options.resolve;
  const originalPlugins = compiler.options.module.rules[0].oneOf[0].use[0].options.plugins;

  try {
    assert.throws(
      () =>
        new HippySourceLocatorWebpackPlugin({
          reactModule: "/missing/hippy-react.cjs",
        }).apply(compiler as unknown as Compiler),
      /Cannot find module/,
    );

    context.is(compiler.options.entry, originalEntry);
    context.is(compiler.options.module.rules, originalRules);
    context.is(compiler.options.resolve, originalResolve);
    context.deepEqual(originalPlugins, []);
    context.is(process.env.NODE_OPTIONS, "--trace-warnings");
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test("production activation is side-effect free", (context) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = "--trace-warnings";
  const compiler = createCompiler("production");
  try {
    new HippySourceLocatorWebpackPlugin().apply(compiler as unknown as Compiler);
    context.is(process.env.NODE_OPTIONS, "--trace-warnings");
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test("successful activation registers child preload once", (context) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = "--trace-warnings";
  const compiler = createCompiler();
  const plugin = new HippySourceLocatorWebpackPlugin({
    reactModule: path.resolve(__dirname, "fixtures/hippy-react.cjs"),
  });
  try {
    plugin.apply(compiler as unknown as Compiler);
    plugin.apply(compiler as unknown as Compiler);
    const registrations = process.env.NODE_OPTIONS.match(/index\.cjs/g) ?? [];
    context.is(registrations.length, 1);
  } finally {
    restoreNodeOptions(oldNodeOptions);
  }
});

test("unsupported entry leaves the complete configuration transaction unchanged", (context) => {
  const base = createCompiler();
  const compiler = { ...base, options: { ...base.options, entry: 42 } };
  const originalRules = compiler.options.module.rules;
  const originalResolve = compiler.options.resolve;
  const originalPlugins = compiler.options.module.rules[0].oneOf[0].use[0].options.plugins;

  assert.throws(
    () =>
      new HippySourceLocatorWebpackPlugin({
        debugServer: false,
        reactModule: path.resolve(__dirname, "fixtures/hippy-react.cjs"),
      }).apply(compiler as unknown as Compiler),
    /unsupported Webpack entry/,
  );

  context.is(compiler.options.entry, 42);
  context.is(compiler.options.module.rules, originalRules);
  context.is(compiler.options.resolve, originalResolve);
  context.deepEqual(originalPlugins, []);
});

test("configuration transaction supports Webpack rule variants", (context) => {
  const base = createCompiler();
  const rules = [
    { loader: "/virtual/node_modules/babel-loader/index.js", options: { plugins: [] } },
    { use: "/virtual/node_modules/babel-loader/index.js" },
    { rules: [{ use: { loader: "/virtual/node_modules/babel-loader/index.js", options: {} } }] },
    { oneOf: [{ use: [{ loader: "/virtual/node_modules/babel-loader/index.js" }] }] },
  ];

  const compiler = { ...base, options: { ...base.options, module: { rules } } };

  new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, "fixtures/hippy-react.cjs"),
  }).apply(compiler as unknown as Compiler);

  type ConfiguredLoader = { options: { plugins: string[] } };

  const configuredRules = compiler.options.module.rules as unknown as [
    ConfiguredLoader,
    { use: ConfiguredLoader },
    { rules: [{ use: ConfiguredLoader }] },
    { oneOf: [{ use: [ConfiguredLoader] }] },
  ];
  const pluginLists = [
    configuredRules[0].options.plugins,
    configuredRules[1].use.options.plugins,
    configuredRules[2].rules[0].use.options.plugins,
    configuredRules[3].oneOf[0].use[0].options.plugins,
  ];
  context.true(
    pluginLists.every(
      (plugins) =>
        plugins.length === 1 && /plugin-transform-react-jsx-source/.test(plugins[0] ?? ""),
    ),
  );
});

test("configuration transaction supports Webpack entry variants", async (context) => {
  const configureEntry = (entry: unknown): unknown => {
    const base = createCompiler();
    const compiler = { ...base, options: { ...base.options, entry } };
    new HippySourceLocatorWebpackPlugin({
      debugServer: false,
      reactModule: path.resolve(__dirname, "fixtures/hippy-react.cjs"),
    }).apply(compiler as unknown as Compiler);
    return compiler.options.entry;
  };

  const hasRuntimeFirst = (entry: unknown): boolean =>
    Array.isArray(entry) && String(entry[0]).endsWith("runtime-entry.cjs");

  context.true(hasRuntimeFirst(configureEntry("./src/main.js")));
  context.true(hasRuntimeFirst(configureEntry(["./src/main.js"])));
  const descriptor = configureEntry({ import: "./src/main.js" }) as { import: unknown };
  context.true(hasRuntimeFirst(descriptor.import));
  const entries = configureEntry({ app: "./src/main.js" }) as { app: unknown };
  context.true(hasRuntimeFirst(entries.app));
  const syncFactory = configureEntry(() => "./src/main.js") as () => unknown;
  context.true(hasRuntimeFirst(syncFactory()));
  const asyncFactory = configureEntry(async () => "./src/main.js") as () => Promise<unknown>;
  context.true(hasRuntimeFirst(await asyncFactory()));
});

test("plugin injects source transform, runtime entry, and resolved React module", (context) => {
  const compiler = createCompiler();
  const originalBabelOptions = compiler.options.module.rules[0].oneOf[0].use[0].options;
  new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, "fixtures/hippy-react.cjs"),
  }).apply(compiler as unknown as Compiler);

  const babelOptions = compiler.options.module.rules[0].oneOf[0].use[0].options;
  context.deepEqual(originalBabelOptions.plugins, []);
  context.true(
    babelOptions.plugins.some((plugin) => /plugin-transform-react-jsx-source/.test(plugin)),
  );
  context.true(compiler.options.entry.index[0]?.endsWith("runtime-entry.cjs"));
  const reactAlias = compiler.options.resolve.alias.__HIPPY_SOURCE_LOCATOR_UI_MODULE__$;
  context.is(reactAlias, path.resolve(__dirname, "fixtures/hippy-react.cjs"));
});

test("plugin does not inject twice", (context) => {
  const compiler = createCompiler();
  const plugin = new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, "fixtures/hippy-react.cjs"),
  });
  plugin.apply(compiler as unknown as Compiler);
  plugin.apply(compiler as unknown as Compiler);

  const babelPlugins = compiler.options.module.rules[0].oneOf[0].use[0].options.plugins;
  context.is(
    babelPlugins.filter((item) => /plugin-transform-react-jsx-source/.test(item)).length,
    1,
  );
  context.is(
    compiler.options.entry.index.filter((item) => item.endsWith("runtime-entry.cjs")).length,
    1,
  );
});

test("plugin is disabled in production", (context) => {
  const compiler = createCompiler("production");
  new HippySourceLocatorWebpackPlugin({
    debugServer: false,
    reactModule: path.resolve(__dirname, "fixtures/hippy-react.cjs"),
  }).apply(compiler as unknown as Compiler);

  context.deepEqual(compiler.options.entry, { index: ["./src/main.js"] });
  context.deepEqual(compiler.options.module.rules[0].oneOf[0].use[0].options.plugins, []);
});

test("debug-server integration can be disabled", (context) => {
  const oldNodeOptions = process.env.NODE_OPTIONS;
  const compiler = createCompiler();
  new HippySourceLocatorWebpackPlugin({ debugServer: false }).apply(
    compiler as unknown as Compiler,
  );

  context.is(process.env.NODE_OPTIONS, oldNodeOptions);
});
