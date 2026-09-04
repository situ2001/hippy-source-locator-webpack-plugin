import path from 'node:path';
import type { Compiler } from 'webpack';
import {
  type DebugServerAdapter,
  installDebugServerMiddleware,
} from './debug-server-adapter';
import { configureWebpackForSourceLocator } from './webpack-configuration';

const PLUGIN_NAME = 'HippySourceLocatorWebpackPlugin';

export interface SourceLocatorActivationOptions {
  enabled?: boolean;
  reactModule?: string;
  debugServer?: boolean;
  hippyDebugServer?: DebugServerAdapter | DebugServerAdapter[];
}

interface ActivationCompiler {
  context: string;
  options: { mode?: string };
  getInfrastructureLogger?(name: string): { warn(message: string): void };
}

function enableDebugServerChildRegistration(): void {
  const debugServerRegister = path.resolve(__dirname, 'debug-server-register.cjs');
  const requireOption = `--require=${JSON.stringify(debugServerRegister)}`;
  const nodeOptions = process.env.NODE_OPTIONS || '';
  if (!nodeOptions.includes(debugServerRegister)) {
    process.env.NODE_OPTIONS = `${nodeOptions} ${requireOption}`.trim();
  }
}

export function activateSourceLocator(
  compiler: Compiler,
  options: SourceLocatorActivationOptions,
): void {
  const host = compiler as unknown as ActivationCompiler;
  const enabled = typeof options.enabled === 'boolean'
    ? options.enabled
    : host.options.mode !== 'production';
  if (!enabled) return;

  configureWebpackForSourceLocator(compiler, {
    reactModule: options.reactModule,
    runtimeEntry: path.resolve(__dirname, 'runtime-entry.cjs'),
  });

  if (options.debugServer === false) return;
  enableDebugServerChildRegistration();
  const logger = host.getInfrastructureLogger?.(PLUGIN_NAME);
  installDebugServerMiddleware(host.context, {
    adapters: options.hippyDebugServer,
    onError(error, packageName) {
      logger?.warn(`Could not register ${packageName} inspector middleware: ${error.message}`);
    },
  });
}

export function activateDebugServerPreload(
  entry: string = process.argv[1] || '',
  projectRoot: string = process.cwd(),
): void {
  const isDebugServer = /(?:^|[/\\])(?:hippy-debug|debug-server|index-debug\.js)$/.test(entry);
  if (isDebugServer) installDebugServerMiddleware(projectRoot, { forceLoad: true });
}
