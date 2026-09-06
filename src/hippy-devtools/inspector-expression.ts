import { inspectNode } from '../js-runtime/inspect-node';

export function createInspectorExpression(nodeId: number): string {
  return `(${inspectNode.toString()})(${JSON.stringify(nodeId)})`;
}
