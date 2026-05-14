import type { Graph, View, SceneGraph, SceneWarning, Node, Edge } from './types.ts';
import { evaluateContainment } from './graph.ts';

export function evaluateView(graph: Graph, view: View): SceneGraph {
  const spatialNodes: Node[] = [];
  const latentNodes: Node[] = [];

  for (const node of graph.nodes.values()) {
    const role = view.nodeRoles[node.kind];
    if (role === 'spatial') {
      spatialNodes.push(node);
    } else if (role === 'latent') {
      latentNodes.push(node);
    }
    // hidden or undefined (implicitly hidden) → skip
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

  const containment = evaluateContainment(graph, view);

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
    spatialNodes,
    latentNodes,
    arrows,
    summaryEdges,
    containment,
    warnings,
  };
}
