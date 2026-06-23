import type {
  Node,
  Edge,
  Graph,
  NodeId,
  EdgeId,
  KindId,
  View,
  ContainmentTree,
  ContainmentWarning,
} from './types.ts';

export function buildGraph(nodes: readonly Node[], edges: readonly Edge[], pack: string = '', info?: string): Graph {
  const nodeMap = new Map<NodeId, Node>();
  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      throw new Error(`buildGraph: duplicate node id ${node.id}`);
    }
    nodeMap.set(node.id, node);
  }

  const edgeMap = new Map<EdgeId, Edge>();
  const edgesByKind = new Map<KindId, Set<EdgeId>>();
  const outgoing = new Map<NodeId, Set<EdgeId>>();
  const incoming = new Map<NodeId, Set<EdgeId>>();

  for (const nodeId of nodeMap.keys()) {
    outgoing.set(nodeId, new Set());
    incoming.set(nodeId, new Set());
  }

  for (const edge of edges) {
    if (edgeMap.has(edge.id)) {
      throw new Error(`buildGraph: duplicate edge id ${edge.id}`);
    }
    if (!nodeMap.has(edge.from)) {
      throw new Error(`buildGraph: edge ${edge.id} references missing node ${edge.from}`);
    }
    if (!nodeMap.has(edge.to)) {
      throw new Error(`buildGraph: edge ${edge.id} references missing node ${edge.to}`);
    }

    edgeMap.set(edge.id, edge);

    let kindSet = edgesByKind.get(edge.kind);
    if (!kindSet) {
      kindSet = new Set();
      edgesByKind.set(edge.kind, kindSet);
    }
    kindSet.add(edge.id);

    outgoing.get(edge.from)!.add(edge.id);
    incoming.get(edge.to)!.add(edge.id);
  }

  return {
    nodes: nodeMap,
    edges: edgeMap,
    edgesByKind,
    outgoing,
    incoming,
    pack,
    info,
  };
}

export function evaluateContainment(graph: Graph, view: View): ContainmentTree {
  const containKinds = Object.entries(view.edgeRoles)
    .filter(([, role]) => role === 'contain')
    .map(([kindId]) => kindId);

  const spatialNodeIds = [...graph.nodes.keys()].filter(
    (id) => {
      const node = graph.nodes.get(id)!;
      return view.nodeRoles[node.kind] === 'spatial';
    }
  );

  if (containKinds.length > 1) {
    throw new Error(
      `evaluateContainment: view "${view.id}" has multiple contain-role edge kinds: ${containKinds.join(', ')}`
    );
  }

  if (containKinds.length === 0) {
    return {
      rootIds: spatialNodeIds,
      rootIndex: new Map(spatialNodeIds.map((id, i) => [id, i] as const)),
      childrenOf: new Map(),
      parentOf: new Map(),
      warnings: [],
    };
  }

  const containKind = containKinds[0];
  const containEdgeIds = graph.edgesByKind.get(containKind) ?? new Set<EdgeId>();

  const parentOf = new Map<NodeId, NodeId>();
  const childrenOf = new Map<NodeId, NodeId[]>();
  const warnings: ContainmentWarning[] = [];

  for (const edgeId of containEdgeIds) {
    const edge = graph.edges.get(edgeId)!;
    const child = edge.from;
    const parent = edge.to;

    if (parentOf.has(child)) {
      warnings.push({
        code: 'multiple-parents',
        nodeId: child,
        message: `node ${child} already has parent ${parentOf.get(child)}; ignoring additional parent ${parent}`,
      });
      continue;
    }

    parentOf.set(child, parent);

    let children = childrenOf.get(parent);
    if (!children) {
      children = [];
      childrenOf.set(parent, children);
    }
    children.push(child);
  }

  // Cycle detection
  for (const startNode of parentOf.keys()) {
    const visited = new Set<NodeId>();
    const path: NodeId[] = [];
    let current: NodeId | undefined = startNode;

    while (current !== undefined) {
      if (visited.has(current)) {
        const cycleStart = path.indexOf(current);
        const cyclePath = [...path.slice(cycleStart), current];
        throw new Error(
          `evaluateContainment: cycle in containment graph: ${cyclePath.join(' → ')}`
        );
      }
      visited.add(current);
      path.push(current);
      current = parentOf.get(current);
    }
  }

  const rootIds = spatialNodeIds.filter((id) => !parentOf.has(id));
  const rootIndex = new Map(rootIds.map((id, i) => [id, i] as const));

  return { rootIds, rootIndex, childrenOf, parentOf, warnings };
}
