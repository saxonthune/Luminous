import type { PortableGraph } from './graph.js';

/** Route edges, unlike containment, are the parent relationship in a REST tree. */
export function buildRestTree(graph: PortableGraph) {
  if (graph.direction !== 'RIGHT' || graph.nodes.some(node => node.group || node.parentId)) throw new Error('rest-api-tree requires a flat LR path tree');
  const children = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  const parents = new Map<string, string>();
  for (const edge of graph.edges) {
    if (!children.has(edge.source) || !children.has(edge.target)) throw new Error('REST tree edge has an unknown endpoint');
    if (parents.has(edge.target)) throw new Error(`REST tree node has multiple parents: ${edge.target}`);
    parents.set(edge.target, edge.source); children.get(edge.source)!.push(edge.target);
  }
  const roots = graph.nodes.filter(node => !parents.has(node.id)).map(node => node.id);
  if (roots.length !== 1) throw new Error('rest-api-tree requires one root');
  const descendants = new Map<string, string[]>(), seen = new Set<string>();
  function visit(id: string): string[] {
    if (seen.has(id)) throw new Error('REST tree must be acyclic');
    seen.add(id);
    const result = children.get(id)!.flatMap(child => [child, ...visit(child)]);
    descendants.set(id, result); return result;
  }
  visit(roots[0]);
  if (seen.size !== graph.nodes.length) throw new Error('REST tree contains unreachable nodes or a cycle');
  return { roots, children, descendants };
}
export function hiddenRestNodes(descendants: ReadonlyMap<string, readonly string[]>, collapsed: ReadonlySet<string>): Set<string> {
  return new Set([...collapsed].flatMap(id => [...(descendants.get(id) ?? [])]));
}

/** One-level disclosure: reveal each direct child, but keep all deeper levels hidden. */
export function revealRestChildren(children: ReadonlyMap<string, readonly string[]>, collapsed: ReadonlySet<string>, id: string): Set<string> {
  const childIds = children.get(id);
  if (!childIds) throw new Error(`Unknown REST node: ${id}`);
  const next = new Set(collapsed);
  next.delete(id);
  for (const child of childIds) {
    if (children.get(child)?.length) next.add(child);
  }
  return next;
}
