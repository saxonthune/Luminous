import { compoundLayeredLayout, rowWithInputsLayout, leadingTreeLayout, connectionCorridorLayout } from '@luminous/cactus/layout';
import { buildRestTree } from '../rest-tree.js';
import type { PortableGraph, PortableLayout, LayoutHints, NodeMeasurements } from '../graph.js';

/** Layered compound layout, following the same broad approach as Pele.
 * Default geometry is computed once; runtime movement never mutates it. */
export async function computeDefaultLayout(graph: PortableGraph, measurements: NodeMeasurements, mode?: 'action-flow' | 'rest-api-tree', hints?: LayoutHints): Promise<PortableLayout> {
  const children = new Map<string, string[]>();
  const sizes = new Map<string, { w: number; h: number }>();
  const headers = new Map<string, number>();
  for (const node of graph.nodes) {
    if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    const measured = measurements[node.id];
    if (!measured || !Number.isFinite(measured.w) || !Number.isFinite(measured.h) || measured.w <= 0 || measured.h <= 0) throw new Error(`Missing or invalid measured size for ${node.id}`);
    sizes.set(node.id, { w: measured.w, h: measured.h });
    if (node.group) headers.set(node.id, (measured.headerHeight ?? measured.h) + 16);
  }
  if (hints?.spine) {
    if (mode) throw new Error('spine layout requires an ordinary Mermaid diagram');
    const spine = hints.spine;
    const attachments = (hints.attachments ?? []).map(item => ({ ...item }));
    // Keep default-visible related schema records together when both attach to the spine.
    for (const item of attachments) {
      const node = graph.nodes.find(candidate => candidate.id === item.node);
      for (const field of node?.card?.fields ?? []) {
        const key = field.schema?.schemaKey;
        const target = key && graph.nodes.find(candidate => candidate.id !== item.node && candidate.card?.schemaKey === key);
        const other = target && attachments.find(candidate => candidate.node === target.id);
        if (other) other.side = item.side;
      }
    }
    // A stage owns one attachment column. Its first declaration selects the side.
    const stageSides = new Map<string, 'left' | 'right'>();
    for (const item of attachments) {
      if (!stageSides.has(item.step)) stageSides.set(item.step, item.side);
      item.side = stageSides.get(item.step)!;
    }
    const all = [...spine, ...attachments.map(item => item.node)];
    const groups = graph.nodes.filter(node => node.group);
    const leaves = graph.nodes.filter(node => !node.group);
    if (new Set(all).size !== all.length || all.length !== leaves.length || all.some(id => !leaves.some(node => node.id === id)) || attachments.some(item => !spine.includes(item.step))) throw new Error('spine layout must assign each non-container node once and attach to a spine step');
    for (const group of groups) {
      const members = spine.filter(id => graph.nodes.find(node => node.id === id)?.parentId === group.id);
      const indices = members.map(id => spine.indexOf(id));
      if (group.parentId || !members.length || children.get(group.id)?.length !== members.length || indices.at(-1)! - indices[0] + 1 !== indices.length) throw new Error('spine containers must contain consecutive spine steps only');
    }
    const spineWidth = Math.max(...spine.map(id => sizes.get(id)!.w));
    const leftWidth = Math.max(0, ...attachments.filter(item => item.side === 'left').map(item => sizes.get(item.node)!.w));
    const gap = 260;
    const centerX = leftWidth + gap + spineWidth / 2;
    const result: PortableLayout = {};
    let y = 0;
    for (const id of spine) {
      const owner = graph.nodes.find(node => node.id === id)?.parentId;
      const previous = spine[spine.indexOf(id) - 1];
      if (owner && graph.nodes.find(node => node.id === previous)?.parentId !== owner) y += headers.get(owner)!;
      const step = sizes.get(id)!;
      const attached = attachments.filter(item => item.step === id);
      // Reuse the REST API tree's first-child alignment and subtree demand.
      const stageIds = [id, ...attached.map(item => item.node)];
      const stageSizes = new Map(stageIds.map(node => [node, sizes.get(node)!]));
      const stage = leadingTreeLayout([id], new Map([[id, attached.map(item => item.node)]]), stageSizes, { x: gap, y: 32 });
      const height = Math.max(...stageIds.map(node => stage.get(node)!.y + sizes.get(node)!.h));
      result[id] = { x: centerX - step.w / 2, y, ...step };
      for (const item of attached) {
        const size = sizes.get(item.node)!;
        result[item.node] = {
          x: item.side === 'left' ? leftWidth - size.w : leftWidth + gap + spineWidth + gap,
          y: y + stage.get(item.node)!.y,
          ...size,
        };
      }
      y += height + 64;
    }
    for (const group of groups) {
      const members = spine.filter(id => graph.nodes.find(node => node.id === id)?.parentId === group.id).map(id => result[id]);
      const top = Math.min(...members.map(rect => rect.y)) - headers.get(group.id)!;
      const bottom = Math.max(...members.map(rect => rect.y + rect.h)) + 20;
      const width = Math.max(spineWidth + 40, sizes.get(group.id)!.w);
      result[group.id] = { x: centerX - width / 2, y: top, w: width, h: bottom - top };
    }
    return result;
  }
  if (hints?.attachments?.length) throw new Error('layout attachments require a spine');
  if (mode === 'rest-api-tree') {
    if (hints?.nonOrderingEdges.length) throw new Error('rest-api-tree cannot exclude parent edges from layout');
    const tree = buildRestTree(graph);
    const positions = leadingTreeLayout(tree.roots, tree.children, sizes);
    return Object.fromEntries(graph.nodes.map(node => [node.id, { ...positions.get(node.id)!, ...sizes.get(node.id)! }]));
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
  const transitions = graph.nodes.filter(node => node.card?.component === 'transition');
  if (transitions.length && graph.nodes.every(node => !node.group && !node.parentId)) {
    const ids = new Set(transitions.map(node => node.id));
    const connections = transitions.map(node => {
      const incoming = graph.edges.filter(edge => edge.target === node.id);
      const outgoing = graph.edges.filter(edge => edge.source === node.id);
      if (incoming.length !== 1 || outgoing.length !== 1 || ids.has(incoming[0].source) || ids.has(outgoing[0].target)) throw new Error('Transition nodes require one incoming state and one outgoing state');
      return {
        id: node.id, source: incoming[0].source, target: outgoing[0].target, ...sizes.get(node.id)!,
        ordering: !hints?.nonOrderingEdges.some(hint => hint.source === node.id && hint.target === outgoing[0].target),
      };
    });
    if (graph.edges.every(edge => ids.has(edge.source) || ids.has(edge.target))) {
      const result = await connectionCorridorLayout(new Map([...sizes].filter(([id]) => !ids.has(id))), connections, graph.direction);
      return Object.fromEntries(graph.nodes.map(node => [node.id, { ...result.positions.get(node.id)!, ...result.sizes.get(node.id)! }]));
    }
  }
  const result = await compoundLayeredLayout({ rootIds: graph.nodes.filter(node => !node.parentId).map(node => node.id), childrenOf: children, nodeSizes: sizes, headerHeights: headers, edges: graph.edges.filter(edge => !hints?.nonOrderingEdges.some(hint => hint.source === edge.source && hint.target === edge.target)).map(edge => ({ id: edge.id, from: edge.source, to: edge.target })) }, { direction: graph.direction, spacing: 1.1, containerDirections: new Map(graph.nodes.filter(node => node.direction).map(node => [node.id, node.direction!])) });
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
