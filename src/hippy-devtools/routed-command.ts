import path from 'node:path';
import type { CommandSender } from './debug-server-adapter';

interface Publisher {
  publish(message: unknown): unknown;
  disconnect(): unknown;
}
interface Subscriber {
  subscribe(handler: (message: string) => void): unknown;
  disconnect(): unknown;
}
interface RoutingModules {
  getDBOperator(): {
    Publisher: new (channel: string) => Publisher;
    Subscriber: new (channel: string) => Subscriber;
  };
  requestId: { create(): number };
  createUpwardChannel(clientId: string, extension: string): string;
  createDownwardChannel(clientId: string, extension: string): string;
}

/** Re-enter protocol routing: on iOS, DOM and Runtime use different app clients. */
export function createRoutedCommandSender(
  middlewareRoot: string,
  loadModule: (request: string) => unknown,
): CommandSender {
  let modules: RoutingModules | undefined;
  return async (context, command) => {
    if (!context.clientId) throw new Error('Hippy source locator requires a debug-server clientId.');
    if (!modules) {
      const root = path.dirname(middlewareRoot);
      modules = {
        ...loadModule(path.join(root, 'db')) as Pick<RoutingModules, 'getDBOperator'>,
        ...loadModule(path.join(root, 'utils/global-id')) as Pick<RoutingModules, 'requestId'>,
        ...loadModule(path.join(root, 'utils/pub-sub-channel')) as Pick<RoutingModules, 'createUpwardChannel' | 'createDownwardChannel'>,
      };
    }
    const { Publisher, Subscriber } = modules.getDBOperator();
    const id = modules.requestId.create();
    // Publishing to this client's upward channel lets the router select its JavaScriptCore transport.
    // A dedicated extension keeps internal evaluation replies out of DevTools.
    const publisher = new Publisher(modules.createUpwardChannel(context.clientId, 'source-locator'));
    const subscriber = new Subscriber(modules.createDownwardChannel(context.clientId, 'source-locator'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Hippy source locator evaluation timed out.')), 5000);
        // Subscribe before publishing: the in-memory bus can deliver a reply immediately.
        Promise.resolve().then(() => subscriber.subscribe((message) => {
          let response: { id?: unknown };
          try {
            response = JSON.parse(message) as { id?: unknown };
          } catch {
            return;
          }
          // Concurrent selections share this channel; only consume this request's reply.
          if (response?.id === id) resolve(response);
        })).then(() => publisher.publish({ ...command, id })).catch(reject);
      });
    } finally {
      clearTimeout(timer);
      await Promise.allSettled([
        Promise.resolve().then(() => subscriber.disconnect()),
        Promise.resolve().then(() => publisher.disconnect()),
      ]);
    }
  };
}
