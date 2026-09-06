import HippySourceLocatorWebpackPlugin, {
  type SourceLocatorPluginOptions,
} from '../src/index';
import type { Compiler } from 'webpack';
import {
  type Inspector,
  type UiManagerModule,
  injectToUiModule,
} from '../src/js-runtime/runtime';

const options: SourceLocatorPluginOptions = { enabled: true, debugServer: false };
const plugin = new HippySourceLocatorWebpackPlugin(options);
const compiler = null as unknown as Compiler;
const uiManager = null as unknown as UiManagerModule;
const inspector: Inspector = injectToUiModule(uiManager);

void plugin;
void plugin.apply(compiler);
void inspector;
