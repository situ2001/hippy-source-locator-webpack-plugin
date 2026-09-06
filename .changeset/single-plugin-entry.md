---
"hippy-source-locator-webpack-plugin": minor
---

Use the Webpack plugin from the package root to configure runtime injection and
debug-server registration.

The `/runtime`, `/debug-server-register`, and `/package.json` subpath exports and
the static `injectToUiModule` API have been removed. To upgrade, remove imports of
these subpaths and calls to `injectToUiModule`, then instantiate the plugin in your
Webpack `plugins` array. When active, the plugin injects the runtime automatically
and registers the debug server unless `debugServer` is `false`.

Start debug-server child processes from the Webpack process after plugin activation
so they inherit its preload configuration.
