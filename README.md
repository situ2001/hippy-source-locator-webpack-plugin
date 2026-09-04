# Hippy Source Locator Webpack Plugin

Locate the source of a Hippy React component selected in DevTools.

## Usage

```sh
pnpm add -D hippy-source-locator-webpack-plugin
```

```js
const HippySourceLocatorWebpackPlugin = require('hippy-source-locator-webpack-plugin');

module.exports = {
  mode: 'development',
  plugins: [
    new HippySourceLocatorWebpackPlugin(),
  ],
};
```

The plugin adds JSX source metadata and a locator runtime to an existing
`babel-loader` rule. It is enabled in non-production Webpack builds by default.

When `hippy-dev` starts the debug server after creating the Webpack compiler, selecting
a node in DevTools prints its component name and source location in the debug-server
process.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `enabled` | Non-production builds | Enables or disables the plugin. |
| `reactModule` | `@hippy/react` or its configured alias | Selects a custom Hippy React entry. |
| `debugServer` | `true` | Enables selected-node forwarding. |
| `hippyDebugServer` | `@hippy/debug-server-next` | Configures one or more custom debug-server adapters. |

Example:

```js
new HippySourceLocatorWebpackPlugin({
  enabled: true,
  reactModule: require.resolve('@hippy/react'),
  debugServer: true,
  hippyDebugServer: {
    packageName: 'your-debug-server-package',
    middlewareRoot: 'path/to/middlewares',
  },
});
```

`hippyDebugServer` accepts an adapter or an array of adapters. Each adapter requires
`packageName` and `middlewareRoot`.

If the debug server starts independently or before the Webpack compiler, preload the
registration entry instead:

```sh
node --require hippy-source-locator-webpack-plugin/debug-server-register <debug-server-entry>
```

## Development

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

## Releasing

Run `pnpm changeset` for each user-visible change, `pnpm version-packages` to prepare
the version and changelog, then `pnpm release` to publish.
