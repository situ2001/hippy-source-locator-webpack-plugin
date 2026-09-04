import type { Compiler } from 'webpack';
import {
  activateSourceLocator,
} from './activation';
import { injectToUiModule } from './runtime';

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
  static readonly injectToUiModule = injectToUiModule;
  readonly options: SourceLocatorPluginOptions;

  constructor(options: SourceLocatorPluginOptions = {}) {
    this.options = options;
  }

  apply(compiler: Compiler): void {
    activateSourceLocator(compiler, this.options);
  }
}
