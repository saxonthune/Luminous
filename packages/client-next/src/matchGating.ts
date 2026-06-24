import type { Graph, View, NodeId, KindId } from '@luminous/core';
import { reachable } from '@luminous/core';

export interface MatchGatingCfg {
  matchKind: KindId;
  dataflowKind: KindId;
  armProp: string;
}

export const MATCH_GATING_CFG: MatchGatingCfg = {
  matchKind: 'rust.match',
  dataflowKind: 'rust.dataflow',
  armProp: 'arm',
};

/**
 * Computes the set of nodes to demote to peek based on match-arm gating.
 *
 * Returns nodes that participate in data flow but are NOT reachable from
 * data-flow sources when non-selected arm edges are suppressed.
 */
export function computeMatchGating(
  graph: Graph,
  view: View,
  cfg: MatchGatingCfg,
): ReadonlySet<NodeId> {
  // Layer off or absent → no gating
  const layerState = view.layers['match-gating'];
  if (!layerState || layerState === 'off') return new Set();

  // Build suppressed-edge set from match nodes with a selectedArm
  const suppressed = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.kind !== cfg.matchKind) continue;
    const selectedArm = node.props['selectedArm'];
    if (typeof selectedArm !== 'string') continue;

    const outEdgeIds = graph.outgoing.get(node.id);
    if (!outEdgeIds) continue;
    for (const edgeId of outEdgeIds) {
      const edge = graph.edges.get(edgeId);
      if (!edge || edge.kind !== cfg.dataflowKind) continue;
      const armValue = edge.props[cfg.armProp];
      if (armValue !== selectedArm) suppressed.add(edgeId);
    }
  }

  if (suppressed.size === 0) return new Set();

  // Seeds: nodes with no incoming dataflow edge
  const seeds: NodeId[] = [];
  for (const node of graph.nodes.values()) {
    const inEdgeIds = graph.incoming.get(node.id);
    let hasIncomingDataflow = false;
    if (inEdgeIds) {
      for (const edgeId of inEdgeIds) {
        const edge = graph.edges.get(edgeId);
        if (edge?.kind === cfg.dataflowKind) { hasIncomingDataflow = true; break; }
      }
    }
    if (!hasIncomingDataflow) {
      // Only seed if the node participates in dataflow at all (has outgoing dataflow)
      const outEdgeIds = graph.outgoing.get(node.id);
      if (outEdgeIds) {
        for (const edgeId of outEdgeIds) {
          const edge = graph.edges.get(edgeId);
          if (edge?.kind === cfg.dataflowKind) { seeds.push(node.id); break; }
        }
      }
    }
  }

  const survivors = reachable(graph, seeds, {
    direction: 'out',
    edgeAllowed: (e) => e.kind !== cfg.dataflowKind || !suppressed.has(e.id),
  });

  // Peek set: nodes that participate in dataflow but are not survivors
  const dataflowNodes = new Set<NodeId>();
  const dfEdges = graph.edgesByKind.get(cfg.dataflowKind);
  if (dfEdges) {
    for (const edgeId of dfEdges) {
      const edge = graph.edges.get(edgeId);
      if (edge) { dataflowNodes.add(edge.from); dataflowNodes.add(edge.to); }
    }
  }

  const peek = new Set<NodeId>();
  for (const nodeId of dataflowNodes) {
    if (!survivors.has(nodeId)) peek.add(nodeId);
  }

  // When layer state is 'on' (hard hide), callers still receive the same set;
  // PgCanvasView interprets layer state to decide whether to render peek nodes.
  return peek;
}
