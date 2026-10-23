import { compoundLayeredLayout, rowWithInputsLayout } from '@luminous/cactus/layout';
import type { PortableGraph, PortableLayout, LayoutHints } from '../graph.js';

/** Layered compound layout, following the same broad approach as Pele.
 * Default geometry is computed once; runtime movement never mutates it. */
export async function computeDefaultLayout(graph: PortableGraph, mode?: 'action-flow', hints?: LayoutHints): Promise<PortableLayout> {
  const children = new Map<string, string[]>();
  const sizes = new Map<string, { w: number; h: number }>();
  for (const node of graph.nodes) {
    if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    if (node.card) {
      const lines = (text: string, chars: number) => text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / chars)), 0);
      sizes.set(node.id, { w: 340, h: Math.max(node.card.diff ? 48 : 0, lines(node.card.title, node.card.diff ? 30 : 36) * 24 + 16) + Math.max(0, node.card.body ? lines(node.card.body, 40) * 21 + 16 : 0) + (node.card.footer || node.card.info ? lines((node.card.footer?.text ?? '') + (node.card.info ? ' [more]' : ''), 40) * 21 + 16 : 0) });
      continue;
    }
    const longest = Math.max(...node.label.split('\n').map(line => line.length));
    const w = Math.min(380, Math.max(180, longest * 8 + 32));
    const lines = node.label.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length * 8 / (w - 32))), 0);
    sizes.set(node.id, { w, h: node.group ? 64 : Math.max(64, lines * 21 + 32) });
  }
  if (mode === 'action-flow') {
    if (graph.nodes.some(node => node.group)) throw new Error('action-flow currently requires a flat diagram');
    const isAttachment = (node: PortableGraph['nodes'][number]) => node.classes.some(role => role === 'data' || role === 'code');
    const spine = graph.nodes.filter(node => !isAttachment(node));
    const spineIds = new Set(spine.map(node => node.id));
    const chain = graph.edges.filter(edge => spineIds.has(edge.source) && spineIds.has(edge.target));
    const roots = spine.filter(node => !chain.some(edge => edge.target === node.id));
    if (roots.length !== 1) throw new Error('action-flow needs one unbranched action chain');
    const ordered: string[] = [];
    let current: string | undefined = roots[0].id;
    while (current) {
      if (ordered.includes(current)) throw new Error('action-flow cannot contain an action loop');
      ordered.push(current);
      const next = chain.filter(edge => edge.source === current);
      if (next.length > 1) throw new Error('action-flow cannot branch');
      current = next[0]?.target;
    }
    if (ordered.length !== spine.length) throw new Error('action-flow must connect every action');
    const columns = ordered.map(id => ({ id, inputs: [] as string[] }));
    for (const node of graph.nodes.filter(isAttachment)) {
      const targets = graph.edges.filter(edge => edge.source === node.id && spineIds.has(edge.target));
      const column = columns.find(column => column.id === targets[0]?.target);
      if (!column) throw new Error(`Attachment ${node.id} needs an action target`);
      column.inputs.push(node.id);
    }
    const positions = rowWithInputsLayout(columns, sizes, graph.direction);
    return Object.fromEntries(graph.nodes.map(node => [node.id, { ...positions.get(node.id)!, ...sizes.get(node.id)! }]));
  }
  const result = await compoundLayeredLayout({ rootIds: graph.nodes.filter(node => !node.parentId).map(node => node.id), childrenOf: children, nodeSizes: sizes, headerHeight: 64, edges: graph.edges.filter(edge => !hints?.nonOrderingEdges.some(hint => hint.source === edge.source && hint.target === edge.target)).map(edge => ({ id: edge.id, from: edge.source, to: edge.target })) }, { direction: graph.direction, containerDirections: new Map(graph.nodes.filter(node => node.direction).map(node => [node.id, node.direction!])) });
  const layout: PortableLayout = {};
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  function rect(id: string): PortableLayout[string] {
    if (layout[id]) return layout[id];
    const node = byId.get(id)!;
    const parent = node.parentId ? rect(node.parentId) : { x: 0, y: 0 };
    const position = result.positions.get(id)!;
    const size = result.sizes.get(id)!;
    return layout[id] = { x: parent.x + position.x, y: parent.y + position.y, ...size };
  }
  for (const node of graph.nodes) rect(node.id);
  return layout;
}
