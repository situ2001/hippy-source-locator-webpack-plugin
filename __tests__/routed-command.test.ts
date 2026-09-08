import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutedCommandSender } from '../src/hippy-devtools/routed-command';

for (const failure of ['timeout', 'subscribe', 'publish'] as const) {
  test(`routed evaluation releases its connections after ${failure}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const connections = new Set<PubSub>();
    class PubSub {
      constructor() { connections.add(this); }
      async subscribe() {
        if (failure === 'subscribe') throw new Error('subscribe failed');
      }
      async publish() {
        if (failure === 'publish') throw new Error('publish failed');
      }
      async disconnect() { connections.delete(this); }
    }
    const modules = {
      getDBOperator: () => ({ Publisher: PubSub, Subscriber: PubSub }),
      requestId: { create: () => -1 },
      createUpwardChannel: () => 'up',
      createDownwardChannel: () => 'down',
    };
    const send = createRoutedCommandSender('/debug-server/middlewares', () => modules);
    const result = send({ clientId: 'page', sendToApp: () => assert.fail('Must use protocol routing') }, {
      method: 'Runtime.evaluate', params: { expression: '1' },
    });
    const rejected = assert.rejects(result as Promise<unknown>, failure === 'timeout' ? /timed out/ : /failed/);
    // Allow subscription and publishing to complete before simulating a missing reply.
    await new Promise(resolve => setImmediate(resolve));
    if (failure === 'timeout') t.mock.timers.tick(5000);
    await rejected;
    assert.equal(connections.size, 0);
  });
}
