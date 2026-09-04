import type { Compiler } from 'webpack';

const PLUGIN_NAME = 'HippySourceLocatorWebpackPlugin';
const UI_MODULE_ALIAS = '__HIPPY_SOURCE_LOCATOR_UI_MODULE__';

type BabelItem = string | [unknown, Record<string, unknown>?] | unknown;
interface BabelOptions {
  plugins?: BabelItem[];
  presets?: BabelItem[];
  [key: string]: unknown;
}
interface LoaderObject { loader?: unknown; options?: BabelOptions | string; [key: string]: unknown }
type LoaderEntry = string | LoaderObject;
interface WebpackRule {
  loader?: unknown;
  oneOf?: WebpackRule[];
  options?: BabelOptions | string;
  rules?: WebpackRule[];
  use?: LoaderEntry | LoaderEntry[];
  [key: string]: unknown;
}
interface ResolveOptions {
  alias?: Record<string, unknown>;
  [key: string]: unknown;
}
interface WebpackOptions {
  entry: unknown;
  mode?: string;
  module?: { rules?: WebpackRule[]; [key: string]: unknown };
  resolve?: ResolveOptions;
}
interface MutableCompiler {
  context: string;
  options: WebpackOptions;
}

export interface WebpackConfigurationOptions {
  reactModule?: string;
  runtimeEntry: string;
}

function isBabelLoader(loader: unknown): loader is string {
  return typeof loader === 'string'
    && /(^|[/\\])babel-loader([/\\]|$)/.test(loader.split('?')[0] ?? '');
}

function isSamePlugin(plugin: BabelItem, sourcePlugin: string): boolean {
  const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
  if (pluginName === sourcePlugin || pluginName === '@babel/plugin-transform-react-jsx-source') return true;
  return typeof pluginName === 'string'
    && /[/\\]plugin-transform-react-jsx-source([/\\]|$)/.test(pluginName);
}

function assertCompatiblePreset(options: BabelOptions): void {
  for (const preset of options.presets || []) {
    const presetName = Array.isArray(preset) ? preset[0] : preset;
    const presetOptions = Array.isArray(preset) ? preset[1] : null;
    if (typeof presetName === 'string'
      && /(^|[/\\])(?:@babel[/\\])?preset-react([/\\]|$)/.test(presetName)
      && presetOptions && presetOptions.runtime === 'automatic') {
      throw new Error(`${PLUGIN_NAME} cannot add JSX source metadata when @babel/preset-react uses the automatic runtime.`);
    }
  }
}

function configureBabelOptions(
  options: BabelOptions | null | undefined,
  sourcePlugin: string,
): BabelOptions {
  const babelOptions = options || {};
  assertCompatiblePreset(babelOptions);
  const plugins = babelOptions.plugins || [];
  return {
    ...babelOptions,
    plugins: plugins.some(plugin => isSamePlugin(plugin, sourcePlugin))
      ? [...plugins]
      : [...plugins, sourcePlugin],
  };
}

function configureUseEntry(
  useEntry: LoaderEntry,
  sourcePlugin: string,
): { entry: LoaderEntry; count: number } {
  if (typeof useEntry === 'string') {
    return isBabelLoader(useEntry)
      ? { entry: { loader: useEntry, options: configureBabelOptions(null, sourcePlugin) }, count: 1 }
      : { entry: useEntry, count: 0 };
  }
  if (!useEntry || !isBabelLoader(useEntry.loader)) return { entry: useEntry, count: 0 };
  if (typeof useEntry.options === 'string') {
    throw new Error(`${PLUGIN_NAME} does not support query-string babel-loader options.`);
  }
  return {
    entry: { ...useEntry, options: configureBabelOptions(useEntry.options, sourcePlugin) },
    count: 1,
  };
}

function configureRules(
  rules: WebpackRule[] | undefined,
  sourcePlugin: string,
): { rules: WebpackRule[]; count: number } {
  let count = 0;
  const configuredRules = (rules || []).map((rule) => {
    const configuredRule = { ...rule };
    if (Array.isArray(rule.oneOf)) {
      const nested = configureRules(rule.oneOf, sourcePlugin);
      configuredRule.oneOf = nested.rules;
      count += nested.count;
    }
    if (Array.isArray(rule.rules)) {
      const nested = configureRules(rule.rules, sourcePlugin);
      configuredRule.rules = nested.rules;
      count += nested.count;
    }
    if (Array.isArray(rule.use)) {
      configuredRule.use = rule.use.map((useEntry) => {
        const configured = configureUseEntry(useEntry, sourcePlugin);
        count += configured.count;
        return configured.entry;
      });
    } else if (rule.use) {
      const configured = configureUseEntry(rule.use, sourcePlugin);
      configuredRule.use = configured.entry;
      count += configured.count;
    }
    if (isBabelLoader(rule.loader)) {
      if (typeof rule.options === 'string') {
        throw new Error(`${PLUGIN_NAME} does not support query-string babel-loader options.`);
      }
      configuredRule.options = configureBabelOptions(rule.options, sourcePlugin);
      count += 1;
    }
    return configuredRule;
  });
  return { rules: configuredRules, count };
}

function prependEntry(entry: unknown, injectedEntry: string): unknown {
  if (typeof entry === 'string') return entry === injectedEntry ? entry : [injectedEntry, entry];
  if (Array.isArray(entry)) return entry.includes(injectedEntry) ? entry : [injectedEntry, ...entry];
  if (typeof entry === 'function') {
    return function injectedEntryFactory(this: unknown, ...args: unknown[]): unknown {
      const result: unknown = entry.apply(this, args);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        return Promise.resolve(result).then(value => prependEntry(value, injectedEntry));
      }
      return prependEntry(result, injectedEntry);
    };
  }
  if (entry && typeof entry === 'object') {
    const entryObject = entry as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(entryObject, 'import')) {
      return { ...entryObject, import: prependEntry(entryObject.import, injectedEntry) };
    }
    return Object.fromEntries(
      Object.entries(entryObject).map(([name, value]) => [name, prependEntry(value, injectedEntry)]),
    );
  }
  throw new TypeError(`${PLUGIN_NAME} received an unsupported Webpack entry configuration.`);
}

function resolveReactModule(reactModule: string | undefined, compiler: MutableCompiler): string {
  const aliases = compiler.options.resolve?.alias || {};
  const configuredAlias = aliases['@hippy/react$'] || aliases['@hippy/react'];
  const request = reactModule || configuredAlias || '@hippy/react';
  if (typeof request !== 'string') {
    throw new TypeError(`${PLUGIN_NAME} requires reactModule or the @hippy/react alias to be a string.`);
  }
  return require.resolve(request, { paths: [compiler.context] });
}

export function configureWebpackForSourceLocator(
  compiler: Compiler,
  options: WebpackConfigurationOptions,
): void {
  const mutableCompiler = compiler as unknown as MutableCompiler;
  const sourcePlugin = require.resolve('@babel/plugin-transform-react-jsx-source', {
    paths: [mutableCompiler.context, __dirname],
  });
  const reactModule = resolveReactModule(options.reactModule, mutableCompiler);
  const configuredRules = configureRules(mutableCompiler.options.module?.rules, sourcePlugin);
  if (!configuredRules.count) {
    throw new Error(`${PLUGIN_NAME} could not find babel-loader in module.rules.`);
  }
  const configuredEntry = prependEntry(mutableCompiler.options.entry, options.runtimeEntry);
  const configuredResolve: ResolveOptions = {
    ...mutableCompiler.options.resolve,
    alias: {
      ...mutableCompiler.options.resolve?.alias,
      [`${UI_MODULE_ALIAS}$`]: reactModule,
    },
  };

  mutableCompiler.options.module = {
    ...mutableCompiler.options.module,
    rules: configuredRules.rules,
  };
  mutableCompiler.options.resolve = configuredResolve;
  mutableCompiler.options.entry = configuredEntry;
}
