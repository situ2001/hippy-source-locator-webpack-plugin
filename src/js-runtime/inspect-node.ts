interface InspectedNode {
  componentName?: string;
  nativeName?: string;
  source?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  } | null;
}

interface InspectorGlobal {
  __HIPPY_DEVTOOLS__?: {
    inspectNode(nodeId: number): InspectedNode | null;
  };
}

/**
 * Evaluated in the Hippy app through Runtime.evaluate. Keep this function self-contained.
 * @returns String of node label and location
 */
export function inspectNode(nodeId: number): string | null {
  const api = typeof global !== 'undefined'
    && (global as typeof global & InspectorGlobal).__HIPPY_DEVTOOLS__;
  if (!api || typeof api.inspectNode !== 'function') return null;

  const data = api.inspectNode(nodeId);
  if (!data) return null;

  let label = data.componentName || data.nativeName || 'Unknown component';
  if (data.nativeName && data.nativeName !== label) label += ` <${data.nativeName}>`;

  const source = data.source;
  if (!source) return `${label} — source unavailable`;

  let location = `${source.fileName}:${source.lineNumber}`;
  if (typeof source.columnNumber === 'number') location += `:${source.columnNumber}`;
  return `${label} — ${location}`;
}

