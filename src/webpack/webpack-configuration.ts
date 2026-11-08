import type { Compiler } from "webpack";

const PLUGIN_NAME = "HippySourceLocatorWebpackPlugin";
const UI_MODULE_ALIAS = "__HIPPY_SOURCE_LOCATOR_UI_MODULE__";

interface BabelOptions {
  plugins?: unknown[];
  [key: string]: unknown;
}

interface LoaderObject {
  loader?: unknown;
  options?: BabelOptions | string;
  [key: string]: unknown;
}

type LoaderEntry = string | LoaderObject;

interface WebpackRule extends LoaderObject {
  oneOf?: WebpackRule[];
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
  return (
    typeof loader === "string" && /(^|[/\\])babel-loader([/\\]|$)/.test(loader.split("?")[0] ?? "")
  );
}

function configureBabelOptions(
  options: BabelOptions | null | undefined,
  sourcePlugin: string,
): BabelOptions {
  const plugins = options?.plugins ?? [];
  return {
    ...options,
    plugins: plugins.includes(sourcePlugin) ? plugins : [...plugins, sourcePlugin],
  };
}

function configureBabelLoader(
  entry: LoaderObject,
  sourcePlugin: string,
): { entry: LoaderObject; count: number };
function configureBabelLoader(
  entry: LoaderEntry,
  sourcePlugin: string,
): { entry: LoaderEntry; count: number };

function configureBabelLoader(
  entry: LoaderEntry,
  sourcePlugin: string,
): { entry: LoaderEntry; count: number } {
  const loader = typeof entry === "string" ? { loader: entry } : entry;
  // oxlint-disable-next-line typescript/no-unnecessary-condition, typescript/strict-boolean-expressions -- Webpack permits falsy loader entries in host configurations.
  if (!loader || !isBabelLoader(loader.loader)) {
    return { entry, count: 0 };
  }
  if (typeof loader.options === "string") {
    throw new Error(`${PLUGIN_NAME} does not support query-string babel-loader options.`);
  }
  return {
    entry: { ...loader, options: configureBabelOptions(loader.options, sourcePlugin) },
    count: 1,
  };
}

function configureRules(
  rules: WebpackRule[] | undefined,
  sourcePlugin: string,
): { rules: WebpackRule[]; count: number } {
  let count = 0;
  const configuredRules = (rules ?? []).map((rule) => {
    const configured = configureBabelLoader(rule, sourcePlugin);
    const configuredRule: WebpackRule = { ...configured.entry };
    count += configured.count;
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
        const configured = configureBabelLoader(useEntry, sourcePlugin);
        count += configured.count;
        return configured.entry;
      });
    } else if (rule.use !== undefined && rule.use !== "") {
      const configured = configureBabelLoader(rule.use, sourcePlugin);
      configuredRule.use = configured.entry;
      count += configured.count;
    }
    return configuredRule;
  });
  return { rules: configuredRules, count };
}

type EntryImports = string | string[];

type EntryValue = EntryImports | { import?: EntryImports; [key: string]: unknown };

type StaticEntry = EntryImports | Record<string, EntryValue>;

type EntryFactory = (this: unknown) => Promise<StaticEntry>;

function prependImports(imports: EntryImports, injectedEntry: string): string[] {
  const entries = typeof imports === "string" ? [imports] : imports;
  return entries.includes(injectedEntry) ? entries : [injectedEntry, ...entries];
}

function prependEntryValue(value: EntryValue, injectedEntry: string): EntryValue {
  if (typeof value === "string" || Array.isArray(value)) {
    return prependImports(value, injectedEntry);
  }
  // Webpack 5 supplies the default import after plugin.apply(), so preserve it here.
  return { ...value, import: prependImports(value.import ?? "./src", injectedEntry) };
}

function prependStaticEntry(entry: unknown, injectedEntry: string): StaticEntry {
  if (typeof entry === "string" || Array.isArray(entry)) {
    return prependImports(entry as EntryImports, injectedEntry);
  }
  if (entry !== null && typeof entry === "object") {
    return Object.fromEntries(
      Object.entries(entry as Record<string, EntryValue>).map(([name, value]) => [
        name,
        prependEntryValue(value, injectedEntry),
      ]),
    );
  }
  throw new TypeError(`${PLUGIN_NAME} received an unsupported Webpack entry configuration.`);
}

function prependEntry(entry: unknown, injectedEntry: string): StaticEntry | EntryFactory {
  if (typeof entry !== "function") {
    return prependStaticEntry(entry, injectedEntry);
  }
  const factory = entry as (this: unknown) => unknown;
  return async function injectedEntryFactory(this: unknown): Promise<StaticEntry> {
    return prependStaticEntry(await factory.call(this), injectedEntry);
  };
}

function resolveReactModule(reactModule: string | undefined, compiler: MutableCompiler): string {
  const aliases = compiler.options.resolve?.alias ?? {};
  const request =
    [reactModule, aliases["@hippy/react$"], aliases["@hippy/react"]].find(Boolean) ??
    "@hippy/react";
  if (typeof request !== "string") {
    throw new TypeError(
      `${PLUGIN_NAME} requires reactModule or the @hippy/react alias to be a string.`,
    );
  }
  return require.resolve(request, { paths: [compiler.context] });
}

export function configureWebpackForSourceLocator(
  compiler: Compiler,
  options: WebpackConfigurationOptions,
): void {
  const mutableCompiler = compiler as unknown as MutableCompiler;
  const sourcePlugin = require.resolve("@babel/plugin-transform-react-jsx-source", {
    paths: [mutableCompiler.context, __dirname],
  });
  const reactModule = resolveReactModule(options.reactModule, mutableCompiler);
  const configuredRules = configureRules(mutableCompiler.options.module?.rules, sourcePlugin);
  if (configuredRules.count === 0) {
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
