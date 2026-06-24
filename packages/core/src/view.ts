import type { Graph, View, SceneGraph, SceneWarning, Node, Edge, NodeId, ResolvedNodeState } from './types.ts';
import { evaluateContainment } from './graph.ts';

export function evaluateView(
  graph: Graph,
  view: View,
  gating?: { peek?: ReadonlySet<NodeId> },
): SceneGraph {
  const peekSet = gating?.peek;

  const nodeStates = new Map<NodeId, ResolvedNodeState>();
  const spatialNodes: Node[] = [];
  const latentNodes: Node[] = [];
  const peekNodes: Node[] = [];

  for (const node of graph.nodes.values()) {
    const baseRole = view.nodeRoles[node.kind];

    let state: ResolvedNodeState;
    if (baseRole === 'spatial' || baseRole === 'latent') {
      if (peekSet?.has(node.id)) {
        // Demote spatial or latent to peek (present but de-emphasized).
        // Latent → peek: peek is "present but dim", which is more visible than
        // latent (not directly rendered), so this is the least-surprising demotion.
        state = 'peek';
      } else {
        state = baseRole;
      }
    } else {
      // hidden or undefined (implicitly hidden) → skip
      state = 'hidden';
    }

    nodeStates.set(node.id, state);

    if (state === 'spatial') {
      spatialNodes.push(node);
    } else if (state === 'latent') {
      latentNodes.push(node);
    } else if (state === 'peek') {
      peekNodes.push(node);
    }
  }

  const arrows: Edge[] = [];
  const summaryEdges: Edge[] = [];

  for (const edge of graph.edges.values()) {
    const role = view.edgeRoles[edge.kind];
    if (role === 'arrow') {
      arrows.push(edge);
    } else if (role === 'summary') {
      summaryEdges.push(edge);
    }
    // contain handled by evaluateContainment; hidden/undefined → skip
  }

  // Include peek nodes in the containment tree so they still occupy space.
  const visibleIds = new Set<NodeId>(spatialNodes.map((n) => n.id));
  for (const n of peekNodes) visibleIds.add(n.id);
  const containment = evaluateContainment(graph, view, visibleIds);

  const warnings: SceneWarning[] = [];

  const spatialIds = new Set(spatialNodes.map((n) => n.id));
  const summaryFromIds = new Set(summaryEdges.map((e) => e.from));
  const summaryToIds = new Set(summaryEdges.map((e) => e.to));

  // Validate latent nodes: each should appear in at least one summary edge.
  for (const node of latentNodes) {
    if (!summaryFromIds.has(node.id) && !summaryToIds.has(node.id)) {
      warnings.push({
        code: 'latent-without-summary',
        id: node.id,
        message: `latent node ${node.id} has no summary edge; it will not be visible in this view`,
      });
    }
  }

  // Validate summary edges: the source (from) must be a spatial node.
  for (const edge of summaryEdges) {
    if (!spatialIds.has(edge.from)) {
      warnings.push({
        code: 'orphan-summary-edge',
        id: edge.id,
        message: `summary edge ${edge.id} has non-spatial source ${edge.from}; chip has nowhere to render`,
      });
    }
  }

  return {
    nodeStates,
    spatialNodes,
    latentNodes,
    peekNodes,
    arrows,
    summaryEdges,
    containment,
    warnings,
  };
}
