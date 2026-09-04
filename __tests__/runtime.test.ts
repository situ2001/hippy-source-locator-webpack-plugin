import type { FiberNode, InspectorGlobal } from '../src/runtime';
import test from './helpers/test';

const HippySourceLocatorWebpackPlugin = require('../dist/index.cjs') as typeof import('../src/index').default;
const runtime = require('../dist/runtime.cjs') as typeof import('../src/runtime');

test('package exports the Webpack plugin and runtime adapter', (t) => {
  t.is(typeof HippySourceLocatorWebpackPlugin, 'function');
  t.is(typeof HippySourceLocatorWebpackPlugin.injectToUiModule, 'function');
  t.is(typeof runtime.injectToUiModule, 'function');
});

test('injectToUiModule installs a serializable inspector', (t) => {
  function Demo() {}
  const rootFiber: FiberNode = {
    type: Demo,
    _debugSource: {
      fileName: '/project/src/Demo.jsx',
      lineNumber: 4,
      columnNumber: 2,
    },
    return: null,
  };
  const nativeFiber: FiberNode = {
    type: 'View',
    stateNode: { nativeName: 'View' },
    return: rootFiber,
  };
  const target: InspectorGlobal = {};

  runtime.injectToUiModule({
    getNodeById: nodeId => (nodeId === 7 ? nativeFiber : null),
  }, target);

  t.deepEqual(target.__HIPPY_DEVTOOLS__?.inspectNode?.(7), {
    nodeId: 7,
    nativeName: 'View',
    componentName: 'Demo',
    source: {
      fileName: '/project/src/Demo.jsx',
      lineNumber: 4,
      columnNumber: 2,
    },
    fiberStack: [
      { name: 'View', source: null },
      {
        name: 'Demo',
        source: {
          fileName: '/project/src/Demo.jsx',
          lineNumber: 4,
          columnNumber: 2,
        },
      },
    ],
  });
  t.is(target.__HIPPY_DEVTOOLS__?.inspectNode?.(8), null);
  t.is(target.__HIPPY_DEVTOOLS__?.inspectNode?.('7'), null);
});

test('injectToUiModule preserves other devtools adapters', (t) => {
  const target: InspectorGlobal = {
    __HIPPY_DEVTOOLS__: { anotherInspector: true },
  };

  runtime.injectToUiModule({ getNodeById: () => null }, target);

  t.true(target.__HIPPY_DEVTOOLS__?.anotherInspector);
  t.is(typeof target.__HIPPY_DEVTOOLS__?.inspectNode, 'function');
});
