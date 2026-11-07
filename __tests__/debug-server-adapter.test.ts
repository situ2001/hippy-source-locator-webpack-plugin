import type { MiddlewareManager } from "../src/hippy-devtools/debug-server-adapter";

import assert from "node:assert/strict";
import vm from "node:vm";

import * as debugServerAdapter from "../src/hippy-devtools/debug-server-adapter";
import { createInspectorExpression } from "../src/hippy-devtools/inspector-expression";
import test from "./helpers/test";

const {
  INSPECTED_NODE_METHOD,
  createSelectionMiddleware,
  installDebugServerMiddleware,
  prependMiddleware,
} = debugServerAdapter;

test("selection middleware evaluates the injected page runtime after selection", async (context) => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const middleware = createSelectionMiddleware();
  const response = { result: {} };

  const result = await middleware(
    {
      msg: { params: { nodeId: 42 } },
      async sendToApp(command) {
        calls.push(command);
        return { result: {} };
      },
    },
    async () => response,
  );

  context.is(result, response);
  context.is(calls.length, 1);
  const [command] = calls;
  assert.ok(command);
  context.is(command.method, "Runtime.evaluate");
  context.true(command.params.returnByValue);
  context.true((command.params.expression as string).endsWith("(42)"));
});

test("selection middleware logs the evaluated source location in the debug-server process", async (context) => {
  const logs: string[] = [];
  const middleware = createSelectionMiddleware((location) => logs.push(location));

  await middleware(
    {
      msg: { params: { nodeId: 42 } },
      async sendToApp() {
        return {
          result: {
            result: { type: "string", value: "Example <View> — /project/src/Example.tsx:12:8" },
          },
        };
      },
    },
    async () => undefined,
  );
  await Promise.resolve();

  context.deepEqual(logs, [
    "[Hippy Source Locator] Example <View> — /project/src/Example.tsx:12:8",
  ]);
});

test("selection middleware ignores commands without a numeric node id", async (context) => {
  let sendCount = 0;
  const middleware = createSelectionMiddleware();

  await middleware(
    {
      msg: { params: { nodeId: "42" } },
      sendToApp() {
        sendCount += 1;
      },
    },
    async () => undefined,
  );

  context.is(sendCount, 0);
});

test("selection middleware does not break selection when evaluate fails", async (context) => {
  const response = { result: {} };
  const middleware = createSelectionMiddleware();
  const result = await middleware(
    {
      msg: { params: { nodeId: 42 } },
      sendToApp() {
        throw new Error("runtime unavailable");
      },
    },
    async () => response,
  );

  context.is(result, response);
});

test("prependMiddleware preserves existing middleware and installs once", (context) => {
  const existing = (): undefined => undefined;

  const injected = (): undefined => undefined;

  const manager: MiddlewareManager = {
    upwardMiddleWareListMap: {
      [INSPECTED_NODE_METHOD]: existing,
    },
  };

  context.true(prependMiddleware(manager, INSPECTED_NODE_METHOD, injected));
  context.deepEqual(manager.upwardMiddleWareListMap[INSPECTED_NODE_METHOD], [injected, existing]);
  context.false(prependMiddleware(manager, INSPECTED_NODE_METHOD, injected));
});

test("installDebugServerMiddleware supports a loaded debug-server adapter", (context) => {
  const androidMiddleWareManager: MiddlewareManager = { upwardMiddleWareListMap: {} };
  const iOSMiddleWareManager: MiddlewareManager = { upwardMiddleWareListMap: {} };
  const entry = "/virtual/debug-server/dist/index.js";
  const modules: Record<string, unknown> = {
    [entry]: {},
    "/virtual/debug-server/dist/middlewares/android": { androidMiddleWareManager },
    "/virtual/debug-server/dist/middlewares/ios": { iOSMiddleWareManager },
  };

  const result = installDebugServerMiddleware("/project", {
    moduleCache: { [entry]: {} },
    resolveModule(name) {
      if (name === "@hippy/debug-server-next") {
        return entry;
      }
      throw new Error("not installed");
    },
    loadModule(request) {
      return modules[request];
    },
  });

  context.deepEqual(result, {
    installed: true,
    packageName: "@hippy/debug-server-next",
  });
  context.is(
    typeof androidMiddleWareManager.upwardMiddleWareListMap[INSPECTED_NODE_METHOD],
    "function",
  );
  context.is(
    typeof iOSMiddleWareManager.upwardMiddleWareListMap[INSPECTED_NODE_METHOD],
    "function",
  );
});

test("inspector expression serializes the node id", (context) => {
  const expression = createInspectorExpression(7);
  context.true(expression.includes("__HIPPY_DEVTOOLS__"));
  context.true(expression.endsWith("(7)"));
});

test("inspector expression returns the component and source location", (context) => {
  const inspectedNode = {
    nodeId: 7,
    nativeName: "View",
    componentName: "Example",
    source: { fileName: "/project/src/Example.tsx", lineNumber: 12, columnNumber: 8 },
    fiberStack: [{ name: "Example", source: null }],
  };
  const result: unknown = vm.runInNewContext(createInspectorExpression(7), {
    global: { __HIPPY_DEVTOOLS__: { inspectNode: () => inspectedNode } },
  });

  context.is(result, "Example <View> — /project/src/Example.tsx:12:8");
});

test("inspector expression identifies a component without source metadata", (context) => {
  const result: unknown = vm.runInNewContext(createInspectorExpression(7), {
    global: {
      __HIPPY_DEVTOOLS__: {
        inspectNode: () => ({ componentName: "Example", nativeName: "View", source: null }),
      },
    },
  });

  context.is(result, "Example <View> — source unavailable");
});
