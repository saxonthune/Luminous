import type { MerinoAction, MerinoDocument, MerinoEdge, MerinoNode, MerinoTab } from '@luminous/core/merino';
import type { MerinoRenderNode } from './projection.ts';

export interface MerinoClipboard {
  nodes: MerinoNode[];
  edges: MerinoEdge[];
}

/** Snapshot selected Nodes at their rendered positions, retaining only Edges
 * whose two endpoints are copied. */
export function copyMerinoSelection(
  doc: MerinoDocument,
  selectedIds: ReadonlyArray<string>,
  renderNodes: ReadonlyArray<MerinoRenderNode>,
): MerinoClipboard | undefined {
  const selected = new Set(selectedIds);
  const positions = new Map(renderNodes.map((n) => [n.node.id, n]));
  const nodes = doc.nodes
    .filter((node) => selected.has(node.id))
    .map((node) => {
      const rendered = positions.get(node.id);
      return rendered ? { ...node, x: rendered.x, y: rendered.y } : { ...node };
    });
  if (nodes.length === 0) return undefined;
  return {
    nodes,
    edges: doc.edges.filter((edge) => selected.has(edge.from) && selected.has(edge.to)).map((edge) => ({ ...edge })),
  };
}

function uniqueId(taken: Set<string>, prefix: string): string {
  let i = 1;
  while (taken.has(`${prefix}-${i}`)) i += 1;
  const id = `${prefix}-${i}`;
  taken.add(id);
  return id;
}

/** Build a paste into `tab`. Parents and Edges only survive when both of their
 * copied endpoints are present; this lets a partial selection stand alone. */
export function pasteMerinoSelection(
  doc: MerinoDocument,
  clipboard: MerinoClipboard,
  tab: MerinoTab,
  offset: { x: number; y: number },
): { actions: MerinoAction[]; nodeIds: string[] } {
  const taken = new Set([...doc.nodes, ...doc.edges, ...doc.nodeTypes, ...doc.edgeTypes].map((item) => item.id));
  const ids = new Map<string, string>();
  for (const node of clipboard.nodes) ids.set(node.id, uniqueId(taken, 'n'));

  const actions: MerinoAction[] = clipboard.nodes.map((node) => ({
    type: 'addNode',
    id: ids.get(node.id)!,
    tab,
    nodeType: node.type,
    name: node.name,
    text: node.text,
    parent: node.parent ? ids.get(node.parent) : undefined,
    x: (node.x ?? 40) + offset.x,
    y: (node.y ?? 40) + offset.y,
  }));
  for (const node of clipboard.nodes) {
    if (node.expanded) actions.push({ type: 'setNode', id: ids.get(node.id)!, expanded: true });
  }
  for (const edge of clipboard.edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (from && to) actions.push({ type: 'connect', id: uniqueId(taken, 'e'), edgeType: edge.type, from, to });
  }
  return { actions, nodeIds: [...ids.values()] };
}
