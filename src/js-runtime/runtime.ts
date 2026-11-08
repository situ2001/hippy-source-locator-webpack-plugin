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
  inspectNode(this: void, nodeId: unknown): InspectedNode | null;
}

export interface InspectorGlobal {
  [key: string]: unknown;
  __HIPPY_DEVTOOLS__?: Record<string, unknown> & Partial<Inspector>;
}

/** Serialized into the Webpack entry; keep all runtime dependencies inside this function. */
export function injectToUiModule(
  uiModule: UiManagerModule,
  globalObject?: InspectorGlobal,
): Inspector {
  const INSPECTOR_GLOBAL_NAME = "__HIPPY_DEVTOOLS__";

  function getFirstName(...names: (string | null | undefined)[]): string | null {
    return names.find((name) => name !== undefined && name !== null && name !== "") ?? null;
  }

  function getFiberName(fiber: FiberNode | null | undefined): string | null {
    const type = fiber?.type;
    if (typeof type === "string") {
      return type;
    }
    if (typeof type === "function") {
      const component = type;
      return getFirstName(component.displayName, component.name);
    }
    if (type && typeof type === "object") {
      return getFirstName(type.displayName, type.name);
    }
    return null;
  }

  function getFiberSource(fiber: FiberNode | null | undefined): SourceLocation | null {
    const source = fiber?._debugSource;
    if (!source || typeof source.fileName !== "string" || typeof source.lineNumber !== "number") {
      return null;
    }
    const result: SourceLocation = { fileName: source.fileName, lineNumber: source.lineNumber };
    if (typeof source.columnNumber === "number") {
      result.columnNumber = source.columnNumber;
    }
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
      if (!source && currentSource) {
        source = currentSource;
      }
      if (name !== null && name !== "") {
        if (componentName === null && typeof currentNode.type !== "string") {
          componentName = name;
        }
        fiberStack.push({ name, source: currentSource });
      }
      currentNode = currentNode.return;
    }

    return {
      nodeId,
      nativeName: getFirstName(element?.nativeName, element?.meta?.component?.name),
      componentName: componentName ?? getFiberName(targetNode),
      source,
      fiberStack,
    };
  }

  function createInspector(uiModule: UiManagerModule): Inspector {
    // oxlint-disable-next-line typescript/no-unnecessary-condition, typescript/strict-boolean-expressions -- UIManagerModule is provided by the host Hippy runtime.
    if (!uiModule || typeof uiModule.getNodeById !== "function") {
      throw new TypeError("Hippy source locator requires UIManagerModule.getNodeById().");
    }
    return {
      inspectNode(nodeId: unknown): InspectedNode | null {
        if (typeof nodeId !== "number") {
          return null;
        }
        const targetNode = uiModule.getNodeById(nodeId);
        return targetNode ? serializeFiber(nodeId, targetNode) : null;
      },
    };
  }

  const target: InspectorGlobal | undefined =
    globalObject ?? (typeof global !== "undefined" ? global : undefined);
  if (!target) {
    throw new Error("Hippy source locator cannot find the JavaScript global object.");
  }
  const devtools = target[INSPECTOR_GLOBAL_NAME] ?? {};
  const inspector = createInspector(uiModule);
  devtools.inspectNode = inspector.inspectNode;
  target[INSPECTOR_GLOBAL_NAME] = devtools;
  return inspector;
}
