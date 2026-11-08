import type { FiberNode, InspectorGlobal } from "../src/js-runtime/runtime";

import * as runtime from "../src/js-runtime/runtime";
import test from "./helpers/test";

test("injectToUiModule installs a serializable inspector", (context) => {
  function Demo(): void {}

  const rootFiber: FiberNode = {
    type: Demo,
    _debugSource: {
      fileName: "/project/src/Demo.jsx",
      lineNumber: 4,
      columnNumber: 2,
    },
    return: null,
  };
  const nativeFiber: FiberNode = {
    type: "View",
    stateNode: { nativeName: "View" },
    return: rootFiber,
  };
  const target: InspectorGlobal = {};

  runtime.injectToUiModule(
    {
      getNodeById: (nodeId) => (nodeId === 7 ? nativeFiber : null),
    },
    target,
  );

  context.deepEqual(target.__HIPPY_DEVTOOLS__?.inspectNode?.(7), {
    nodeId: 7,
    nativeName: "View",
    componentName: "Demo",
    source: {
      fileName: "/project/src/Demo.jsx",
      lineNumber: 4,
      columnNumber: 2,
    },
    fiberStack: [
      { name: "View", source: null },
      {
        name: "Demo",
        source: {
          fileName: "/project/src/Demo.jsx",
          lineNumber: 4,
          columnNumber: 2,
        },
      },
    ],
  });
  context.is(target.__HIPPY_DEVTOOLS__?.inspectNode?.(8), null);
  context.is(target.__HIPPY_DEVTOOLS__?.inspectNode?.("7"), null);
});

test("injectToUiModule preserves other devtools adapters", (context) => {
  const target: InspectorGlobal = {
    __HIPPY_DEVTOOLS__: { anotherInspector: true },
  };

  runtime.injectToUiModule({ getNodeById: () => null }, target);

  context.true(target.__HIPPY_DEVTOOLS__?.anotherInspector);
  context.is(typeof target.__HIPPY_DEVTOOLS__?.inspectNode, "function");
});
