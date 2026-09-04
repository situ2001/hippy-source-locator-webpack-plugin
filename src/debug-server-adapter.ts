import path from 'node:path';

export const INSPECTED_NODE_METHOD = 'DOM.setInspectedNode';
export const RUNTIME_EVALUATE_METHOD = 'Runtime.evaluate';
const INSTALL_MARK = Symbol.for('hippy-source-locator-webpack-plugin/debug-server-middleware');
const LOCATION_LOG_PREFIX = '[Hippy Source Locator]';

export interface DebugServerAdapter { packageName: string; middlewareRoot: string }
interface ResolvedDebugServerAdapter extends DebugServerAdapter { entry: string; packageRoot: string }
interface DebugCommand { method: string; params: Record<string, unknown> }
interface RuntimeEvaluateResponse {
  result?: { result?: { value?: unknown } };
}
export interface MiddlewareContext {
  msg?: { params?: { nodeId?: unknown } };
  sendToApp(command: DebugCommand): unknown;
}
export type NextMiddleware = () => unknown | Promise<unknown>;
export type SelectionMiddleware = (context: MiddlewareContext, next: NextMiddleware) => unknown | Promise<unknown>;
export type LocationLogger = (location: string) => void;
export interface MiddlewareManager {
  upwardMiddleWareListMap: Record<string, SelectionMiddleware | SelectionMiddleware[]>;
  [INSTALL_MARK]?: boolean;
}
type ResolveModule = (request: string, options?: { paths?: string[] }) => string;
type LoadModule = (request: string) => unknown;
export interface InstallDebugServerOptions {
  adapters?: DebugServerAdapter | DebugServerAdapter[];
  forceLoad?: boolean;
  loadModule?: LoadModule;
  moduleCache?: Record<string, unknown>;
  onError?: (error: Error, packageName: string) => void;
  resolveModule?: ResolveModule;
}
export interface InstallDebugServerResult { installed: boolean; packageName: string | null }

export const DEBUG_SERVER_ADAPTERS: DebugServerAdapter[] = [
  { packageName: '@hippy/debug-server-next', middlewareRoot: 'middlewares' },
];

export function createInspectorExpression(nodeId: number): string {
  return '(function(){var api=typeof global!==\'undefined\'&&global.__HIPPY_DEVTOOLS__;'
    + 'if(!api||typeof api.inspectNode!==\'function\'){return null;}'
    + `var data=api.inspectNode(${JSON.stringify(nodeId)});`
    + 'if(!data){return null;}'
    + 'var label=data.componentName||data.nativeName||\'Unknown component\';'
    + 'if(data.nativeName&&data.nativeName!==label){label+=\' <\'+data.nativeName+\'>\';}'
    + 'var source=data.source;'
    + 'if(!source){return label+\' — source unavailable\';}'
    + 'var location=source.fileName+\':\'+source.lineNumber;'
    + 'if(typeof source.columnNumber===\'number\'){location+=\':\'+source.columnNumber;}'
    + 'return label+\' — \'+location;}())';
}

function getEvaluationValue(response: unknown): unknown {
  return (response as RuntimeEvaluateResponse | null)?.result?.result?.value;
}

export function createSelectionMiddleware(
  logLocation: LocationLogger = location => console.log(location),
): SelectionMiddleware {
  return async function inspectSelectedNode(context, next) {
    const response = await next();
    const nodeId = context.msg?.params?.nodeId;
    if (typeof nodeId !== 'number') return response;
    try {
      Promise.resolve(context.sendToApp({
        method: RUNTIME_EVALUATE_METHOD,
        params: { expression: createInspectorExpression(nodeId), returnByValue: true },
      })).then((evaluationResponse) => {
        const location = getEvaluationValue(evaluationResponse);
        if (typeof location === 'string') logLocation(`${LOCATION_LOG_PREFIX} ${location}`);
      }).catch(() => undefined);
    } catch {
      return response;
    }
    return response;
  };
}

export function prependMiddleware(
  manager: MiddlewareManager | null | undefined,
  method: string,
  middleware: SelectionMiddleware,
): boolean {
  if (!manager || !manager.upwardMiddleWareListMap || manager[INSTALL_MARK]) return false;
  const middlewareMap = manager.upwardMiddleWareListMap;
  const current = middlewareMap[method];
  if (!current) middlewareMap[method] = middleware;
  else if (Array.isArray(current)) middlewareMap[method] = [middleware, ...current];
  else middlewareMap[method] = [middleware, current];
  Object.defineProperty(manager, INSTALL_MARK, { value: true });
  return true;
}

function resolveDebugServerAdapters(
  projectRoot: string,
  resolveModule: ResolveModule = require.resolve,
  adapters: DebugServerAdapter | DebugServerAdapter[] = DEBUG_SERVER_ADAPTERS,
): ResolvedDebugServerAdapter[] {
  const configuredAdapters = Array.isArray(adapters) ? adapters : [adapters];
  return configuredAdapters.reduce<ResolvedDebugServerAdapter[]>((result, adapter) => {
    if (!adapter || typeof adapter.packageName !== 'string' || typeof adapter.middlewareRoot !== 'string') return result;
    try {
      const entry = resolveModule(adapter.packageName, { paths: [projectRoot] });
      result.push({ ...adapter, entry, packageRoot: path.dirname(entry) });
    } catch {
      // The host project may use either debug-server distribution.
    }
    return result;
  }, []);
}

function isPackageLoaded(
  adapter: ResolvedDebugServerAdapter,
  moduleCache: Record<string, unknown> = require.cache,
): boolean {
  const packagePrefix = `${adapter.packageRoot}${path.sep}`;
  return Object.keys(moduleCache).some(fileName => fileName === adapter.entry || fileName.startsWith(packagePrefix));
}

function loadMiddlewareManagers(
  adapter: ResolvedDebugServerAdapter,
  loadModule: LoadModule = require,
): MiddlewareManager[] {
  loadModule(adapter.entry);
  const middlewareRoot = path.join(adapter.packageRoot, adapter.middlewareRoot);
  const android = loadModule(path.join(middlewareRoot, 'android')) as { androidMiddleWareManager: MiddlewareManager };
  const ios = loadModule(path.join(middlewareRoot, 'ios')) as { iOSMiddleWareManager: MiddlewareManager };
  return [android.androidMiddleWareManager, ios.iOSMiddleWareManager];
}

export function installDebugServerMiddleware(
  projectRoot: string,
  options: InstallDebugServerOptions = {},
): InstallDebugServerResult {
  const adapters = resolveDebugServerAdapters(projectRoot, options.resolveModule, options.adapters);
  const activeAdapters = options.forceLoad
    ? adapters
    : adapters.filter(adapter => isPackageLoaded(adapter, options.moduleCache));
  for (const adapter of activeAdapters) {
    try {
      const managers = loadMiddlewareManagers(adapter, options.loadModule);
      const middleware = createSelectionMiddleware();
      const installed = managers.reduce(
        (count, manager) => count + Number(prependMiddleware(manager, INSPECTED_NODE_METHOD, middleware)),
        0,
      );
      if (installed || managers.every(manager => manager?.[INSTALL_MARK])) {
        return { installed: true, packageName: adapter.packageName };
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)), adapter.packageName);
    }
  }
  return { installed: false, packageName: null };
}
