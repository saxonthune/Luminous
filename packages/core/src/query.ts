import type { Node, Edge, Graph, NodeId, GraphQuery, PropPredicate, TagMatch } from './types.ts';

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function matchPredicate(resolved: unknown, predicate: PropPredicate): boolean {
  switch (predicate.op) {
    case 'eq':
      return resolved === predicate.value;
    case 'ne':
      return resolved !== predicate.value;
    case 'exists':
      return resolved !== undefined;
    case 'absent':
      return resolved === undefined;
    case 'in':
      return predicate.values.includes(resolved);
    case 'gt':
      return typeof resolved === 'number' && resolved > predicate.value;
    case 'gte':
      return typeof resolved === 'number' && resolved >= predicate.value;
    case 'lt':
      return typeof resolved === 'number' && resolved < predicate.value;
    case 'lte':
      return typeof resolved === 'number' && resolved <= predicate.value;
    case 'contains':
      if (typeof resolved === 'string') return resolved.includes(predicate.value);
      if (Array.isArray(resolved)) return resolved.includes(predicate.value);
      return false;
    case 'regex': {
      try {
        return new RegExp(predicate.value).test(String(resolved));
      } catch {
        return false;
      }
    }
  }
}

function matchProps(
  props: Record<string, unknown>,
  queryProps: Record<string, PropPredicate | string | number | boolean | null>
): boolean {
  for (const [path, raw] of Object.entries(queryProps)) {
    const resolved = getByPath(props, path);
    const predicate: PropPredicate =
      raw !== null && typeof raw === 'object' && 'op' in raw
        ? (raw as PropPredicate)
        : { op: 'eq', value: raw };
    if (!matchPredicate(resolved, predicate)) return false;
  }
  return true;
}

function matchTags(tags: string[], constraint: TagMatch): boolean {
  if (constraint.any && !constraint.any.some((t) => tags.includes(t))) return false;
  if (constraint.all && !constraint.all.every((t) => tags.includes(t))) return false;
  if (constraint.none && constraint.none.some((t) => tags.includes(t))) return false;
  return true;
}

function matchKind(kind: string, queryKind: string | string[]): boolean {
  return Array.isArray(queryKind) ? queryKind.includes(kind) : kind === queryKind;
}

export function matchNode(node: Node, query: GraphQuery): boolean {
  if (query.kind !== undefined && !matchKind(node.kind, query.kind)) return false;
  if (query.tags !== undefined && !matchTags(node.tags, query.tags)) return false;
  if (query.props !== undefined && !matchProps(node.props, query.props)) return false;
  if (query.and !== undefined && !query.and.every((q) => matchNode(node, q))) return false;
  if (query.or !== undefined && !query.or.some((q) => matchNode(node, q))) return false;
  if (query.not !== undefined && matchNode(node, query.not)) return false;
  return true;
}

export function matchEdge(edge: Edge, query: GraphQuery): boolean {
  if (query.kind !== undefined && !matchKind(edge.kind, query.kind)) return false;
  if (query.tags !== undefined && !matchTags(edge.tags, query.tags)) return false;
  if (query.props !== undefined && !matchProps(edge.props, query.props)) return false;
  if (query.from !== undefined) {
    const froms = Array.isArray(query.from) ? query.from : [query.from];
    if (!froms.includes(edge.from)) return false;
  }
  if (query.to !== undefined) {
    const tos = Array.isArray(query.to) ? query.to : [query.to];
    if (!tos.includes(edge.to)) return false;
  }
  if (query.and !== undefined && !query.and.every((q) => matchEdge(edge, q))) return false;
  if (query.or !== undefined && !query.or.some((q) => matchEdge(edge, q))) return false;
  if (query.not !== undefined && matchEdge(edge, query.not)) return false;
  return true;
}

export function queryNodes(graph: Graph, query: GraphQuery): Node[] {
  const result: Node[] = [];
  for (const node of graph.nodes.values()) {
    if (matchNode(node, query)) result.push(node);
  }
  return result;
}

export function queryEdges(graph: Graph, query: GraphQuery): Edge[] {
  const result: Edge[] = [];
  for (const edge of graph.edges.values()) {
    if (matchEdge(edge, query)) result.push(edge);
  }
  return result;
}

export function neighborhood(
  graph: Graph,
  id: NodeId,
  hops = 1
): { nodes: Node[]; edges: Edge[] } {
  if (!graph.nodes.has(id)) return { nodes: [], edges: [] };

  const visitedNodes = new Set<NodeId>([id]);
  const visitedEdges = new Set<string>();
  let frontier = new Set<NodeId>([id]);

  for (let hop = 0; hop < hops; hop++) {
    const nextFrontier = new Set<NodeId>();
    for (const nodeId of frontier) {
      for (const edgeId of graph.outgoing.get(nodeId) ?? []) {
        if (visitedEdges.has(edgeId)) continue;
        visitedEdges.add(edgeId);
        const edge = graph.edges.get(edgeId)!;
        if (!visitedNodes.has(edge.to)) {
          visitedNodes.add(edge.to);
          nextFrontier.add(edge.to);
        }
      }
      for (const edgeId of graph.incoming.get(nodeId) ?? []) {
        if (visitedEdges.has(edgeId)) continue;
        visitedEdges.add(edgeId);
        const edge = graph.edges.get(edgeId)!;
        if (!visitedNodes.has(edge.from)) {
          visitedNodes.add(edge.from);
          nextFrontier.add(edge.from);
        }
      }
    }
    frontier = nextFrontier;
  }

  const nodes: Node[] = [];
  for (const nodeId of visitedNodes) {
    nodes.push(graph.nodes.get(nodeId)!);
  }
  const edges: Edge[] = [];
  for (const edgeId of visitedEdges) {
    edges.push(graph.edges.get(edgeId)!);
  }
  return { nodes, edges };
}
