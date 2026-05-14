import type { Graph } from '@luminous/canvas-core';

/** Returns the set of `rtp.action` node ids that have no incoming `statechart.invokes-action` edge. */
export function findOrphanActions(graph: Graph): ReadonlySet<string> {
  const invokedActionIds = new Set<string>();
  for (const edge of graph.edges.values()) {
    if (edge.kind === 'statechart.invokes-action') {
      invokedActionIds.add(edge.to);
    }
  }

  const orphans = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.kind === 'rtp.action' && !invokedActionIds.has(node.id)) {
      orphans.add(node.id);
    }
  }
  return orphans;
}
