# Hippy Source Locator Webpack Plugin

Locate the source of a Hippy React component selected in DevTools.

## Usage

```sh
pnpm add -D hippy-source-locator-webpack-plugin
```

```js
const HippySourceLocatorWebpackPlugin = require("hippy-source-locator-webpack-plugin");

module.exports = {
  mode: "development",
  plugins: [new HippySourceLocatorWebpackPlugin()],
};
```

The plugin adds JSX source metadata to existing `babel-loader` rules and prepends
a locator runtime to the Webpack entry. It activates automatically in development
and `none` modes.

When `hippy-dev` starts the debug server after creating the Webpack compiler, selecting
a node in DevTools prints its component name and source location in the debug-server
process.

## Options

| Option             | Default                                | Description                                          |
| ------------------ | -------------------------------------- | ---------------------------------------------------- |
| `enabled`          | Development and `none` modes           | Controls plugin activation.                          |
| `reactModule`      | `@hippy/react` or its configured alias | Selects a custom Hippy React entry.                  |
| `debugServer`      | `true`                                 | Enables selected-node forwarding.                    |
| `hippyDebugServer` | `@hippy/debug-server-next`             | Configures one or more custom debug-server adapters. |

Example:

```js
new HippySourceLocatorWebpackPlugin({
  enabled: true,
  reactModule: require.resolve("@hippy/react"),
  debugServer: true,
  hippyDebugServer: {
    packageName: "your-debug-server-package",
    middlewareRoot: "path/to/middlewares",
  },
});
```

`hippyDebugServer` accepts an adapter or an array of adapters. Each adapter requires
`packageName` and `middlewareRoot`.

Import the package root and instantiate the plugin to configure runtime injection
and debug-server registration. Start debug-server children from the Webpack process
after plugin activation so they inherit its preload configuration.

## Development

Use Node.js 22.18+ within the 22.x series, or Node.js 24+, for the lint and format tools.

`src/index.ts` is the public plugin entry. Implementation code is grouped by execution environment:

- `src/js-runtime/`: code running in the Hippy app, including runtime injection,
  Fiber inspection, and the function evaluated through `Runtime.evaluate`.
- `src/hippy-devtools/`: debug-server middleware, preload registration, and
  construction of expressions sent to the app.
- `src/webpack/`: activation, runtime module generation, and Webpack configuration changes.

```sh
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

Run `pnpm lint:fix` to apply automatic lint fixes and `pnpm format` to format files.
The shared presets come from `@situ2001/code-standards`. Update them with
`pnpm add -D --save-exact @situ2001/code-standards@latest`.

## Releasing

Run `pnpm changeset` for each user-visible change and commit the generated file with
the change. CI builds and tests each PR update, including the Webpack 4/5 compiler checks.
After a merge to `main`, Changesets creates or updates a Release PR with the version
and changelog. Merge that PR to publish the package to npm.

Add an Actions repository secret named `NPM_TOKEN` in Settings → Secrets and variables →
Actions. Use an npm granular token with publish access to this package and bypass 2FA
enabled for automated publishing. The release job reads it through `NODE_AUTH_TOKEN`;
PR checks do not receive the token.

Enable “Allow GitHub Actions to create and approve pull requests” in Settings → Actions →
General. CI explicitly dispatches checks for bot-created Release PRs.
