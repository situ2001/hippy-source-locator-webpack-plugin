---
"hippy-source-locator-webpack-plugin": minor
---

Consolidate the package around the Webpack plugin entry at `src/index.ts`, building
one JavaScript bundle: `dist/index.cjs`. Plugin activation generates and injects
the app runtime through Webpack and reuses the plugin bundle for child debug-server
preloading. Organize implementation code by execution environment.

Consumers should import the package root and instantiate the plugin. The
`/runtime`, `/debug-server-register`, and `/package.json` subpath exports and the
static `injectToUiModule` API have been removed; plugin activation handles runtime
injection and debug-server registration automatically.
