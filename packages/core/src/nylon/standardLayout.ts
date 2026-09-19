import { dagLayout, spaceRectangles } from '@luminous/cactus/layout';
import type { NylonDocument, NylonResult } from './types.ts';
import { projectNylon } from './projection.ts';

/** Independent miniature geometry; no authored positions are changed. */
export function nylonContentsSchematic(doc: NylonDocument, id: string) {
  const projection = projectNylon(doc, undefined, undefined, undefined, undefined, { kind: 'standard', focusId: id });
  const children = projection.nodes.filter((node) => node.item.parent === id && !node.context);
  const ids = new Set(children.map((node) => node.item.id));
  const edges = projection.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId));
  const geometry = children.map((node) => ({
    id: node.item.id, parentId: null, w: node.kind === 'contract' ? 30 : 22,
    h: node.kind === 'contract' ? 16 : 22,
  }));
  const positions = dagLayout(geometry, edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId })), {
    direction: 'LR', horizontalGap: 20, verticalGap: 14,
  });
  const nodes = children.map((node, index) => ({
    kind: node.kind, ...geometry[index], ...positions.get(node.item.id)!,
  }));
  return {
    nodes, edges,
    width: Math.max(1, ...nodes.map((node) => node.x + node.w)),
    height: Math.max(1, ...nodes.map((node) => node.y + node.h)),
  };
}

/** Compact immediate Children as shared geometry units, keeping pairs intact. */
export function arrangeNylonStandardView(doc: NylonDocument, focusId: string | null): NylonResult {
  if (focusId !== null && !doc.transformations.some((item) => item.id === focusId)) {
    return { ok: false, error: 'Unknown Focus Transformation' };
  }
  const projection = projectNylon(doc, undefined, undefined, undefined, undefined, { kind: 'standard', focusId });
  const children = projection.nodes.filter((node) => !node.context && node.item.parent === (focusId ?? undefined));
  const byId = new Map(children.map((node) => [node.item.id, node]));
  const paired = new Set<string>();
  const units = projection.contractFrames.flatMap((frame) => {
    const input = byId.get(frame.input), output = byId.get(frame.output);
    if (!input || !output || paired.has(frame.input) || paired.has(frame.output)) return [];
    paired.add(frame.input); paired.add(frame.output);
    return [{ id: frame.id, x: frame.x, y: frame.y, width: frame.w, height: frame.h,
      members: [input, output].map((node) => ({ id: node.item.id, x: node.x - frame.x, y: node.y - frame.y })) }];
  });
  for (const node of children) if (!paired.has(node.item.id)) units.push({
    id: node.item.id, x: node.x, y: node.y, width: node.w, height: node.h,
    members: [{ id: node.item.id, x: 0, y: 0 }],
  });
  const positions = new Map(spaceRectangles(units, { gap: 72, origin: { x: 42, y: 80 } }).map((position) => [position.id, position]));
  const next = new Map<string, { x: number; y: number }>();
  for (const unit of units) {
    const position = positions.get(unit.id)!;
    for (const member of unit.members) next.set(member.id, { x: position.x + member.x, y: position.y + member.y });
  }
  return { ok: true, doc: {
    ...doc,
    transformations: doc.transformations.map((item) => next.has(item.id) ? { ...item, ...next.get(item.id) } : item),
    contracts: doc.contracts.map((item) => next.has(item.id) ? { ...item, ...next.get(item.id) } : item),
  } };
}
