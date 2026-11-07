import type SourceLocatorPlugin from "../src/index";
import type { InspectedNode } from "../src/js-runtime/runtime";
import type { Compiler, Configuration, RuleSetRule } from "webpack";

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import webpack from "webpack";

const Plugin = require("../dist/index.cjs") as typeof SourceLocatorPlugin;

type CompilerRunner = Pick<Compiler, "run"> & Partial<Pick<Compiler, "close">>;

type CreateCompiler = (configuration: Configuration) => CompilerRunner;

interface Scenario {
  name: string;
  entry: Configuration["entry"];
  rule(loader: string, markerPlugin: string): RuleSetRule;
  marker: string;
  source: string;
  outputs: string[];
}

function babelLoader(loader: string, markerPlugin: string): RuleSetRule {
  return { loader, options: { plugins: [markerPlugin] } };
}

const defaultScenario: Scenario = {
  name: "string entry with loader options",
  entry: "./app.jsx",
  rule: (loader, markerPlugin) => ({ test: /\.jsx?$/, ...babelLoader(loader, markerPlugin) }),
  marker: "changed",
  source: "app.jsx",
  outputs: ["main.js"],
};

const scenarios: Scenario[] = [
  defaultScenario,
  {
    name: "array entry with string use",
    entry: ["./app.jsx"],
    rule: (loader) => ({ test: /\.jsx?$/, use: loader }),
    marker: "original",
    source: "app.jsx",
    outputs: ["main.js"],
  },
  {
    name: "entry map named import with object use",
    entry: { import: "./app.jsx", second: ["./app.jsx"] },
    rule: (loader, markerPlugin) => ({ test: /\.jsx?$/, use: babelLoader(loader, markerPlugin) }),
    marker: "changed",
    source: "app.jsx",
    outputs: ["import.js", "second.js"],
  },
  {
    name: "sync entry factory with nested rules",
    entry: () => ({ main: "./app.jsx" }),
    rule: (loader, markerPlugin) => ({
      rules: [{ test: /\.jsx?$/, use: [babelLoader(loader, markerPlugin)] }],
    }),
    marker: "changed",
    source: "app.jsx",
    outputs: ["main.js"],
  },
  {
    name: "async entry factory with oneOf",
    entry: async () => ({ main: ["./app.jsx"] }),
    rule: (loader, markerPlugin) => ({
      oneOf: [{ test: /\.jsx?$/, use: [babelLoader(loader, markerPlugin)] }],
    }),
    marker: "changed",
    source: "app.jsx",
    outputs: ["main.js"],
  },
];

const webpack5Scenarios: Scenario[] = [
  {
    ...defaultScenario,
    name: "entry descriptor preserves filename",
    entry: { main: { import: ["./app.jsx"], filename: "custom.js" } },
    outputs: ["custom.js"],
  },
  {
    ...defaultScenario,
    name: "default entry",
    entry: undefined,
    source: "src/index.js",
  },
];

function writeFixture(directory: string): void {
  const source = [
    "const React = { createElement: (type, props) => ({ type, props }) };",
    'const View = "View";',
    'global.runtimeBeforeApp = typeof global.__HIPPY_DEVTOOLS__.inspectNode === "function";',
    'global.element = <View marker="original" />;',
    "global.result = global.__HIPPY_DEVTOOLS__.inspectNode(7);",
  ].join("\n");
  writeFileSync(path.join(directory, "app.jsx"), source);
  mkdirSync(path.join(directory, "src"));
  writeFileSync(path.join(directory, "src/index.js"), source);
  writeFileSync(
    path.join(directory, "babel.config.json"),
    JSON.stringify({ presets: [require.resolve("@babel/preset-react")] }),
  );
  writeFileSync(
    path.join(directory, "marker-plugin.cjs"),
    `module.exports = () => ({ visitor: { StringLiteral({ node }) {
      if (node.value === "original") node.value = "changed";
    } } });`,
  );
  writeFileSync(
    path.join(directory, "react.js"),
    `exports.UIManagerModule = { getNodeById: id => id === 7 ? {
      type: function Demo() {},
      stateNode: { nativeName: "View" },
      _debugSource: global.element.props.__source
    } : null };`,
  );
}

async function compile(compiler: CompilerRunner): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      compiler.run((error, stats) => {
        if (error) {
          reject(error);
          return;
        }
        assert.ok(stats);
        if (stats.hasErrors()) {
          reject(new Error(stats.toString()));
          return;
        }
        resolve();
      });
    });
  } finally {
    // Webpack 4 has no Compiler.close(); Webpack 5 needs it to finish cache work.
    const close = compiler.close;
    if (close) {
      await new Promise<void>((resolve, reject) => {
        close.call(compiler, (error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

const compilers: { name: string; create: CreateCompiler; loader: string; scenarios: Scenario[] }[] =
  [
    {
      name: "Webpack 4",
      create: require("webpack4") as CreateCompiler,
      loader: require.resolve("babel-loader-webpack4"),
      scenarios,
    },
    {
      name: "Webpack 5",
      create: webpack,
      loader: require.resolve("babel-loader"),
      scenarios: [...scenarios, ...webpack5Scenarios],
    },
  ];

for (const compiler of compilers) {
  for (const scenario of compiler.scenarios) {
    void test(`${compiler.name}: ${scenario.name}`, async () => {
      const directory = mkdtempSync(path.join(tmpdir(), "source-locator-webpack-"));
      const originalDirectory = process.cwd();
      try {
        writeFixture(directory);
        // Babel resolves babel.config.json from the host project's working directory.
        process.chdir(directory);
        await compile(
          compiler.create({
            mode: "development",
            context: directory,
            target: "web",
            devtool: false,
            entry: scenario.entry,
            output: { path: path.join(directory, "dist"), filename: "[name].js" },
            module: {
              rules: [scenario.rule(compiler.loader, path.join(directory, "marker-plugin.cjs"))],
            },
            plugins: [
              new Plugin({ debugServer: false, reactModule: path.join(directory, "react.js") }),
            ],
          }),
        );
        const files = readdirSync(path.join(directory, "dist")).sort();
        assert.deepEqual(files, scenario.outputs);
        for (const file of files) {
          const context = {} as {
            runtimeBeforeApp: boolean;
            element: { props: { marker: string } };
            result: InspectedNode;
          };
          vm.runInNewContext(readFileSync(path.join(directory, "dist", file), "utf8"), context);
          assert.equal(context.runtimeBeforeApp, true);
          assert.equal(context.element.props.marker, scenario.marker);
          assert.equal(context.result.componentName, "Demo");
          assert.equal(context.result.source?.fileName, path.join(directory, scenario.source));
          assert.equal(context.result.source.lineNumber, 4);
          assert.equal(context.result.source.columnNumber, 18);
        }
      } finally {
        process.chdir(originalDirectory);
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}
