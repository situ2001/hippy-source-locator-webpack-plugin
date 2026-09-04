import vm from 'node:vm';
import * as debugServerAdapter from '../src/debug-server-adapter';
import type { MiddlewareManager } from '../src/debug-server-adapter';
import test from './helpers/test';

const {
  INSPECTED_NODE_METHOD,
  createInspectorExpression,
  createSelectionMiddleware,
  installDebugServerMiddleware,
  prependMiddleware,
} = debugServerAdapter;

test('selection middleware evaluates the injected page runtime after selection', async (t) => {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const middleware = createSelectionMiddleware();
  const response = { result: {} };

  const result = await middleware({
    msg: { params: { nodeId: 42 } },
    sendToApp(command) {
      calls.push(command);
      return Promise.resolve({ result: {} });
    },
  }, async () => response);

  t.is(result, response);
  t.is(calls.length, 1);
  t.is(calls[0]!.method, 'Runtime.evaluate');
  t.true(calls[0]!.params.returnByValue);
  t.true((calls[0]!.params.expression as string).includes('inspectNode(42)'));
});

test('selection middleware logs the evaluated source location in the debug-server process', async (t) => {
  const logs: string[] = [];
  const middleware = createSelectionMiddleware(location => logs.push(location));

  await middleware({
    msg: { params: { nodeId: 42 } },
    sendToApp() {
      return Promise.resolve({
        result: { result: { type: 'string', value: 'Example <View> — /project/src/Example.tsx:12:8' } },
      });
    },
  }, async () => undefined);
  await Promise.resolve();

  t.deepEqual(logs, ['[Hippy Source Locator] Example <View> — /project/src/Example.tsx:12:8']);
});

test('selection middleware ignores commands without a numeric node id', async (t) => {
  let sendCount = 0;
  const middleware = createSelectionMiddleware();

  await middleware({
    msg: { params: { nodeId: '42' } },
    sendToApp() {
      sendCount += 1;
    },
  }, async () => undefined);

  t.is(sendCount, 0);
});

test('selection middleware does not break selection when evaluate fails', async (t) => {
  const response = { result: {} };
  const middleware = createSelectionMiddleware();
  const result = await middleware({
    msg: { params: { nodeId: 42 } },
    sendToApp() {
      throw new Error('runtime unavailable');
    },
  }, async () => response);

  t.is(result, response);
});

test('prependMiddleware preserves existing middleware and installs once', (t) => {
  const existing = () => undefined;
  const injected = () => undefined;
  const manager: MiddlewareManager = {
    upwardMiddleWareListMap: {
      [INSPECTED_NODE_METHOD]: existing,
    },
  };

  t.true(prependMiddleware(manager, INSPECTED_NODE_METHOD, injected));
  t.deepEqual(manager.upwardMiddleWareListMap[INSPECTED_NODE_METHOD], [injected, existing]);
  t.false(prependMiddleware(manager, INSPECTED_NODE_METHOD, injected));
});

test('installDebugServerMiddleware supports a loaded debug-server adapter', (t) => {
  const androidMiddleWareManager: MiddlewareManager = { upwardMiddleWareListMap: {} };
  const iOSMiddleWareManager: MiddlewareManager = { upwardMiddleWareListMap: {} };
  const entry = '/virtual/debug-server/dist/index.js';
  const modules: Record<string, unknown> = {
    [entry]: {},
    '/virtual/debug-server/dist/middlewares/android': { androidMiddleWareManager },
    '/virtual/debug-server/dist/middlewares/ios': { iOSMiddleWareManager },
  };

  const result = installDebugServerMiddleware('/project', {
    moduleCache: { [entry]: {} },
    resolveModule(name) {
      if (name === '@hippy/debug-server-next') {
        return entry;
      }
      throw new Error('not installed');
    },
    loadModule(request) {
      return modules[request];
    },
  });

  t.deepEqual(result, {
    installed: true,
    packageName: '@hippy/debug-server-next',
  });
  t.is(typeof androidMiddleWareManager.upwardMiddleWareListMap[INSPECTED_NODE_METHOD], 'function');
  t.is(typeof iOSMiddleWareManager.upwardMiddleWareListMap[INSPECTED_NODE_METHOD], 'function');
});

test('inspector expression serializes the node id', (t) => {
  const expression = createInspectorExpression(7);
  t.true(expression.includes('__HIPPY_DEVTOOLS__'));
  t.true(expression.includes('inspectNode(7)'));
});

test('inspector expression returns the component and source location', (t) => {
  const inspectedNode = {
    nodeId: 7,
    nativeName: 'View',
    componentName: 'Example',
    source: { fileName: '/project/src/Example.tsx', lineNumber: 12, columnNumber: 8 },
    fiberStack: [{ name: 'Example', source: null }],
  };
  const result = vm.runInNewContext(createInspectorExpression(7), {
    global: { __HIPPY_DEVTOOLS__: { inspectNode: () => inspectedNode } },
  });

  t.is(result, 'Example <View> — /project/src/Example.tsx:12:8');
});

test('inspector expression identifies a component without source metadata', (t) => {
  const result = vm.runInNewContext(createInspectorExpression(7), {
    global: {
      __HIPPY_DEVTOOLS__: {
        inspectNode: () => ({ componentName: 'Example', nativeName: 'View', source: null }),
      },
    },
  });

  t.is(result, 'Example <View> — source unavailable');
});
