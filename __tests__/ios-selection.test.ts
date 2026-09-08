import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import vm from 'node:vm';
import { installDebugServerMiddleware, type MiddlewareManager, type SelectionMiddleware } from '../src/hippy-devtools/debug-server-adapter';

test('installed iOS middleware routes evaluation to JavaScriptCore and logs the selected node', async (t) => {
  const bus = new EventEmitter();
  const calls: string[] = [];
  const logs: string[] = [];
  const connections = new Set<PubSub>();
  class PubSub {
    handler?: (message: string) => void;
    constructor(readonly channel: string) { connections.add(this); }
    async subscribe(handler: (message: string) => void) {
      this.handler = handler;
      bus.on(this.channel, handler);
    }
    async publish(message: unknown) {
      bus.emit(this.channel, typeof message === 'string' ? message : JSON.stringify(message));
    }
    async disconnect() {
      if (this.handler) bus.off(this.channel, this.handler);
      connections.delete(this);
    }
  }
  let requestId = 0;
  const ios: MiddlewareManager = { upwardMiddleWareListMap: {} };
  const android: MiddlewareManager = { upwardMiddleWareListMap: {} };
  const root = '/virtual/debug-server';
  const modules: Record<string, unknown> = {
    [`${root}/index.js`]: {},
    [`${root}/middlewares/ios`]: { iOSMiddleWareManager: ios },
    [`${root}/middlewares/android`]: { androidMiddleWareManager: android },
    [`${root}/db`]: { getDBOperator: () => ({ Publisher: PubSub, Subscriber: PubSub }) },
    [`${root}/utils/global-id`]: { requestId: { create: () => --requestId } },
    [`${root}/utils/pub-sub-channel`]: {
      createUpwardChannel: (id: string, extension: string) => `${id}_up_${extension}`,
      createDownwardChannel: (id: string, extension: string) => `${id}_down_${extension}`,
    },
  };
  const install = () => installDebugServerMiddleware('/project', {
    forceLoad: true,
    resolveModule: () => `${root}/index.js`,
    loadModule: request => {
      assert.ok(request in modules, `Unexpected module: ${request}`);
      return modules[request];
    },
  });
  install();
  install();
  t.mock.method(console, 'log', (location: string) => logs.push(location));
  bus.on('page_up_source-locator', (message: string) => {
    const command = JSON.parse(message);
    calls.push(`jsc:${command.method}`);
    const value = vm.runInNewContext(command.params.expression, {
      global: { __HIPPY_DEVTOOLS__: { inspectNode: (nodeId: number) => {
        assert.equal(nodeId, 11);
        return { componentName: 'Demo', source: { fileName: '/app/Demo.tsx', lineNumber: 12 } };
      } } },
    });
    // An unrelated reply must not satisfy the pending evaluation.
    bus.emit('page_down_source-locator', JSON.stringify({ id: 123, result: {} }));
    bus.emit('page_down_source-locator', JSON.stringify({ id: command.id, result: { result: { value } } }));
  });
  const middleware = ios.upwardMiddleWareListMap['DOM.setInspectedNode'] as SelectionMiddleware;
  const selectionResponse = { result: {} };
  assert.equal(await middleware({
    clientId: 'page',
    msg: { params: { nodeId: 11 } },
    sendToApp(command) {
      calls.push(`native:${command.method}`);
      return { error: { message: 'Runtime is not supported by the native transport' } };
    },
  }, async () => {
    calls.push('native:DOM.setInspectedNode');
    return selectionResponse;
  }), selectionResponse);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['native:DOM.setInspectedNode', 'jsc:Runtime.evaluate']);
  assert.deepEqual(logs, ['[Hippy Source Locator] Demo — /app/Demo.tsx:12']);
  assert.equal(connections.size, 0);
  assert.equal(bus.listenerCount('page_down_source-locator'), 0);
});
