import { activateDebugServerPreload } from './hippy-devtools/preload';
import type { Compiler } from 'webpack';
import {
  activateSourceLocator,
} from './webpack/activation';

export interface DebugServerAdapter {
  packageName: string;
  middlewareRoot: string;
}

export interface SourceLocatorPluginOptions {
  enabled?: boolean;
  reactModule?: string;
  debugServer?: boolean;
  hippyDebugServer?: DebugServerAdapter | DebugServerAdapter[];
}

export default class HippySourceLocatorWebpackPlugin {
  readonly options: SourceLocatorPluginOptions;

  constructor(options: SourceLocatorPluginOptions = {}) {
    this.options = options;
  }

  apply(compiler: Compiler): void {
    activateSourceLocator(compiler, this.options);
  }
}

if (!require.main) activateDebugServerPreload();
