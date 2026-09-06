# hippy-source-locator-webpack-plugin

## 0.1.0

### Minor Changes

- ae60394: Use the Webpack plugin from the package root to configure runtime injection and
  debug-server registration.
  
  The `/runtime`, `/debug-server-register`, and `/package.json` subpath exports and
  the static `injectToUiModule` API have been removed. To upgrade, remove imports of
  these subpaths and calls to `injectToUiModule`, then instantiate the plugin in your
  Webpack `plugins` array. When active, the plugin injects the runtime automatically
  and registers the debug server unless `debugServer` is `false`.
  
  Start debug-server child processes from the Webpack process after plugin activation
  so they inherit its preload configuration.

## 0.0.3

### Patch Changes

- Bump the package patch version.

## 0.0.2

### Patch Changes

- 6285c05: Make inspector activation side-effect-free until Webpack configuration validates, and apply compiler changes atomically.

  Reduce the published build from seventeen files to the seven runtime and declaration files required by the public package interface.
- Limit the declared `@hippy/react` compatibility range to supported Hippy 2.14.x and 3.x releases.
