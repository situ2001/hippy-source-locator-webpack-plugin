export const INSPECTOR_GLOBAL_NAME = '__HIPPY_DEVTOOLS__';

export interface SourceLocation {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface FiberComponentType {
  displayName?: string;
  name?: string;
}

export type FiberComponent = ((...args: never[]) => unknown) & FiberComponentType;

export interface FiberNode {
  type?: string | FiberComponent | FiberComponentType | null;
  stateNode?: {
    nativeName?: string;
    meta?: { component?: { name?: string } };
  } | null;
  return?: FiberNode | null;
  _debugSource?: Partial<SourceLocation> | null;
}

export interface FiberStackEntry {
  name: string;
  source: SourceLocation | null;
}

export interface InspectedNode {
  nodeId: number;
  nativeName: string | null;
  componentName: string | null;
  source: SourceLocation | null;
  fiberStack: FiberStackEntry[];
}

export interface UiManagerModule {
  getNodeById(nodeId: number): FiberNode | null | undefined;
}

export interface Inspector {
  inspectNode(nodeId: unknown): InspectedNode | null;
}

export interface InspectorGlobal {
  [key: string]: unknown;
  __HIPPY_DEVTOOLS__?: Record<string, unknown> & Partial<Inspector>;
}

function getFiberName(fiber: FiberNode | null | undefined): string | null {
  const type = fiber?.type;
  if (typeof type === 'string') return type;
  if (typeof type === 'function') {
    const component = type as typeof type & FiberComponentType;
    return component.displayName || component.name || null;
  }
  if (type && typeof type === 'object') return type.displayName || type.name || null;
  return null;
}

function getFiberSource(fiber: FiberNode | null | undefined): SourceLocation | null {
  const source = fiber?._debugSource;
  if (!source || typeof source.fileName !== 'string' || typeof source.lineNumber !== 'number') {
    return null;
  }
  const result: SourceLocation = { fileName: source.fileName, lineNumber: source.lineNumber };
  if (typeof source.columnNumber === 'number') result.columnNumber = source.columnNumber;
  return result;
}

function serializeFiber(nodeId: number, targetNode: FiberNode): InspectedNode {
  const element = targetNode.stateNode;
  const fiberStack: FiberStackEntry[] = [];
  let source = getFiberSource(targetNode);
  let componentName: string | null = null;
  let currentNode: FiberNode | null | undefined = targetNode;

  while (currentNode) {
    const name = getFiberName(currentNode);
    const currentSource = getFiberSource(currentNode);
    if (!source && currentSource) source = currentSource;
    if (name) {
      if (!componentName && typeof currentNode.type !== 'string') componentName = name;
      fiberStack.push({ name, source: currentSource });
    }
    currentNode = currentNode.return;
  }

  return {
    nodeId,
    nativeName: element?.nativeName || element?.meta?.component?.name || null,
    componentName: componentName || getFiberName(targetNode),
    source,
    fiberStack,
  };
}

export function createInspector(uiModule: UiManagerModule): Inspector {
  if (!uiModule || typeof uiModule.getNodeById !== 'function') {
    throw new TypeError('Hippy source locator requires UIManagerModule.getNodeById().');
  }
  return {
    inspectNode(nodeId: unknown): InspectedNode | null {
      if (typeof nodeId !== 'number') return null;
      const targetNode = uiModule.getNodeById(nodeId);
      return targetNode ? serializeFiber(nodeId, targetNode) : null;
    },
  };
}

export function injectToUiModule(uiModule: UiManagerModule, globalObject?: InspectorGlobal): Inspector {
  const target = globalObject
    || (typeof global !== 'undefined' ? global as unknown as InspectorGlobal : undefined);
  if (!target) {
    throw new Error('Hippy source locator cannot find the JavaScript global object.');
  }
  const devtools = target[INSPECTOR_GLOBAL_NAME] || {};
  const inspector = createInspector(uiModule);
  devtools.inspectNode = inspector.inspectNode;
  target[INSPECTOR_GLOBAL_NAME] = devtools;
  return inspector;
}
