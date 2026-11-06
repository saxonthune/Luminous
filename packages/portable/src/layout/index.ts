import { compoundLayeredLayout, rowWithInputsLayout, leadingTreeLayout, connectionCorridorLayout } from '@luminous/cactus/layout';
import { USAGE_CARD_MAX_HEIGHT } from '../usage.js';
import { buildRestTree } from '../rest-tree.js';
import type { PortableGraph, PortableLayout, LayoutHints } from '../graph.js';

/** Layered compound layout, following the same broad approach as Pele.
 * Default geometry is computed once; runtime movement never mutates it. */
export async function computeDefaultLayout(graph: PortableGraph, mode?: 'action-flow' | 'rest-api-tree', hints?: LayoutHints): Promise<PortableLayout> {
  const children = new Map<string, string[]>();
  const sizes = new Map<string, { w: number; h: number }>();
  for (const node of graph.nodes) {
    if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    if (node.card?.component === 'transition') {
      sizes.set(node.id, { w: 144, h: 44 });
      continue;
    }
    if (node.card) {
      const lines = (text: string, chars: number) => text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / chars)), 0);
      if (node.card.component === 'schema-card') {
        sizes.set(node.id, { w: 400, h: Math.max(node.card.diff ? 48 : 0, lines(node.card.title, 36) * 24 + 16) + 16 + (node.card.description ? lines(node.card.description, 44) * 20 + 10 : 0) + node.card.fields!.reduce((height, field) => height + Math.max(30, lines(`${field.name} ${field.type}${field.optional ? ' optional' : ''}`, 38) * 20 + 10), 0) + (node.card.footer || node.card.info ? 37 : 0) });
        continue;
      }
      if (node.card.component === 'usage-card') {
        const usage = node.card.usage!;
        const sectionHeight = (rows: typeof usage.startup) => 28 + (rows.length ? rows.reduce((height, row) => height + Math.ceil((row.method.length + row.endpoint.length + 2) / 62) * 18 + 10 + Math.ceil(row.description.length / 62) * 20 + 12, 0) : 22);
        sizes.set(node.id, { w: 520, h: Math.min(USAGE_CARD_MAX_HEIGHT, lines(node.card.title, 52) * 24 + 16 + 32 + usage.uiRoute.paths.reduce((height, path) => height + lines(path, 62) * 18, 0) + lines(usage.uiRoute.context, 62) * 18 + sectionHeight(usage.startup) + sectionHeight(usage.capabilities) + 40 + (node.card.info ? 37 : 0)) });
        continue;
      }
      if (node.card.component === 'rest-card') {
        sizes.set(node.id, { w: 240, h: Math.max(mode === 'rest-api-tree' ? 40 : 44, node.card.diff ? 48 : 0, lines(node.card.title, mode === 'rest-api-tree' ? 20 : 23) * 24 + 16) + (node.card.methods?.length ? Math.ceil(node.card.methods.length / 4) * 24 + 12 : 0) + (node.card.body ? lines(node.card.body, 27) * 21 + 16 : 0) + (node.card.footer || node.card.info ? 37 : 0) });
        continue;
      }
      sizes.set(node.id, { w: 340, h: Math.max(node.card.diff ? 48 : 0, lines(node.card.title, node.card.diff ? 30 : 36) * 24 + 16) + Math.max(0, node.card.body ? lines(node.card.body, 40) * 21 + 16 : 0) + (node.card.footer || node.card.info ? lines((node.card.footer?.text ?? '') + (node.card.info ? ' [more]' : ''), 40) * 21 + 16 : 0) });
      continue;
    }
    const longest = Math.max(...node.label.split('\n').map(line => line.length));
    const w = Math.min(380, Math.max(180, longest * 8 + 32));
    const lines = node.label.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length * 8 / (w - 32))), 0);
    sizes.set(node.id, { w, h: node.group ? 64 : Math.max(64, lines * 21 + 32) });
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
    const gap = 110;
    const centerX = leftWidth + gap + spineWidth / 2;
    const result: PortableLayout = {};
    let y = 0;
    for (const id of spine) {
      const owner = graph.nodes.find(node => node.id === id)?.parentId;
      const previous = spine[spine.indexOf(id) - 1];
      if (owner && graph.nodes.find(node => node.id === previous)?.parentId !== owner) y += 64;
      const step = sizes.get(id)!;
      const attached = attachments.filter(item => item.step === id);
      const sideHeight = (side: 'left' | 'right') => attached.filter(item => item.side === side).reduce((n, item) => n + sizes.get(item.node)!.h + 32, 0) - 32;
      const height = Math.max(step.h, sideHeight('left'), sideHeight('right'));
      result[id] = { x: centerX - step.w / 2, y: y + (height - step.h) / 2, ...step };
      for (const side of ['left', 'right'] as const) {
        let sideY = y + (height - Math.max(0, sideHeight(side))) / 2;
        for (const item of attached.filter(item => item.side === side)) {
          const size = sizes.get(item.node)!;
          result[item.node] = { x: side === 'left' ? leftWidth - size.w : leftWidth + gap + spineWidth + gap, y: sideY, ...size };
          sideY += size.h + 32;
        }
      }
      y += height + 64;
    }
    for (const group of groups) {
      const members = spine.filter(id => graph.nodes.find(node => node.id === id)?.parentId === group.id).map(id => result[id]);
      const top = Math.min(...members.map(rect => rect.y)) - 64;
      const bottom = Math.max(...members.map(rect => rect.y + rect.h)) + 20;
      result[group.id] = { x: centerX - spineWidth / 2 - 20, y: top, w: spineWidth + 40, h: bottom - top };
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
  const result = await compoundLayeredLayout({ rootIds: graph.nodes.filter(node => !node.parentId).map(node => node.id), childrenOf: children, nodeSizes: sizes, headerHeight: 64, edges: graph.edges.filter(edge => !hints?.nonOrderingEdges.some(hint => hint.source === edge.source && hint.target === edge.target)).map(edge => ({ id: edge.id, from: edge.source, to: edge.target })) }, { direction: graph.direction, spacing: 1.1, containerDirections: new Map(graph.nodes.filter(node => node.direction).map(node => [node.id, node.direction!])) });
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
