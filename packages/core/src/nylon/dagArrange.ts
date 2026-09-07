import type { NylonContract, NylonDocument, NylonTransformation, NylonResult } from './types.ts';
import { dagLayout, type LayoutEdge, type TidyNode } from '@luminous/cactus/layout';
import {
  COMPACT_PAIR_HEIGHT,
  COMPACT_PAIR_WIDTH,
  CONTAINER_HEADER,
  CONTAINER_PADDING,
  type NylonContractFrame,
  type NylonProjection,
  type NylonRenderNode,
} from './projection.ts';

export type NylonDagDirection = 'LR' | 'TD' | 'RL' | 'DT';

// One place to tune Nylon's initial DAG spacing without coupling it to the
// generic cactus defaults.
export const NYLON_DAG_LAYOUT = {
  horizontalGap: 72,
  verticalGap: 72,
} as const;

interface LayoutMember {
  id: string;
  offsetX: number;
  offsetY: number;
}

interface LayoutUnit {
  id: string;
  w: number;
  h: number;
  members: LayoutMember[];
}

interface BoundaryLayoutUnit extends LayoutUnit {
  source: string;
  target: string;
}

function itemMap(doc: NylonDocument): Map<string, NylonTransformation | NylonContract> {
  return new Map([
    ...doc.transformations.map((item) => [item.id, item] as const),
    ...doc.contracts.map((item) => [item.id, item] as const),
  ]);
}

function directChildOf(
  items: ReadonlyMap<string, NylonTransformation | NylonContract>,
  containerId: string,
  nodeId: string,
): string | null {
  let current = items.get(nodeId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parent === containerId) return current.id;
    if (current.parent === undefined) return null;
    current = items.get(current.parent);
  }
  return null;
}

function unitsForContainer(
  projection: NylonProjection,
  container: Extract<NylonRenderNode, { kind: 'container' }>,
): { units: LayoutUnit[]; unitByChild: Map<string, string> } {
  const children = projection.nodes.filter((node) => node.item.parent === container.item.id);
  const childById = new Map(children.map((node) => [node.item.id, node]));
  const frameByFacet = new Map<string, NylonContractFrame>();
  for (const frame of projection.contractFrames) {
    if (!childById.has(frame.input) || !childById.has(frame.output)) continue;
    frameByFacet.set(frame.input, frame);
    frameByFacet.set(frame.output, frame);
  }

  const units: LayoutUnit[] = [];
  const unitByChild = new Map<string, string>();
  const addedFrames = new Set<string>();
  for (const child of children) {
    const frame = frameByFacet.get(child.item.id);
    if (!frame) {
      units.push({
        id: child.item.id,
        w: child.w,
        h: child.h,
        members: [{ id: child.item.id, offsetX: 0, offsetY: 0 }],
      });
      unitByChild.set(child.item.id, child.item.id);
      continue;
    }
    unitByChild.set(child.item.id, frame.id);
    if (addedFrames.has(frame.id)) continue;
    addedFrames.add(frame.id);
    const frameLocalX = frame.x - container.x;
    const frameLocalY = frame.y - container.y;
    const members = [frame.input, frame.output].flatMap((id): LayoutMember[] => {
      const member = childById.get(id);
      if (!member) return [];
      return [{
        id,
        offsetX: (member.item.x ?? 0) - frameLocalX,
        offsetY: (member.item.y ?? 0) - frameLocalY,
      }];
    });
    units.push({ id: frame.id, w: frame.w, h: frame.h, members });
  }
  return { units, unitByChild };
}

function reachabilityEdges(
  doc: NylonDocument,
  items: ReadonlyMap<string, NylonTransformation | NylonContract>,
  containerId: string,
  unitByChild: ReadonlyMap<string, string>,
  unitIds: ReadonlySet<string>,
): LayoutEdge[] {
  const unitByNode = new Map<string, string>();
  for (const nodeId of items.keys()) {
    const childId = directChildOf(items, containerId, nodeId);
    if (!childId) continue;
    const unitId = unitByChild.get(childId) ?? childId;
    if (unitIds.has(unitId)) unitByNode.set(nodeId, unitId);
  }

  const nextByNode = new Map<string, string[]>();
  for (const arc of doc.arcs) {
    const next = nextByNode.get(arc.from) ?? [];
    next.push(arc.to);
    nextByNode.set(arc.from, next);
  }

  const result = new Map<string, LayoutEdge>();
  for (const sourceUnit of unitIds) {
    const queue = [...unitByNode]
      .filter(([, unitId]) => unitId === sourceUnit)
      .map(([nodeId]) => nodeId);
    const visited = new Set(queue);
    for (let index = 0; index < queue.length; index += 1) {
      const nodeId = queue[index];
      for (const nextId of nextByNode.get(nodeId) ?? []) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
        const targetUnit = unitByNode.get(nextId);
        if (!targetUnit || targetUnit === sourceUnit) continue;
        result.set(`${sourceUnit}->${targetUnit}`, { source: sourceUnit, target: targetUnit });
      }
    }
  }
  return [...result.values()];
}

function boundaryLayoutUnits(
  doc: NylonDocument,
  items: ReadonlyMap<string, NylonTransformation | NylonContract>,
  containerId: string,
  unitByChild: ReadonlyMap<string, string>,
): BoundaryLayoutUnit[] {
  const transformations = new Map(doc.transformations.map((item) => [item.id, item]));
  const result = new Map<string, BoundaryLayoutUnit>();
  for (const owner of doc.transformations) {
    const pair = owner.contractPair;
    if (!pair) continue;
    if (directChildOf(items, containerId, pair.input) || directChildOf(items, containerId, pair.output)) continue;
    const callers = doc.arcs.filter((arc) => arc.to === pair.input && transformations.has(arc.from));
    const returners = doc.arcs.filter((arc) => arc.from === pair.output && transformations.has(arc.to));
    for (const caller of callers) {
      for (const returner of returners) {
        const sourceChild = directChildOf(items, containerId, caller.from);
        const targetChild = directChildOf(items, containerId, returner.to);
        if (!sourceChild || !targetChild) continue;
        const source = unitByChild.get(sourceChild) ?? sourceChild;
        const target = unitByChild.get(targetChild) ?? targetChild;
        if (source === target) continue;
        const id = `boundary:${containerId}:${owner.id}:${source}:${target}`;
        result.set(id, {
          id,
          source,
          target,
          w: COMPACT_PAIR_WIDTH,
          h: COMPACT_PAIR_HEIGHT,
          members: [],
        });
      }
    }
  }
  return [...result.values()];
}

/** Arrange one Parent Transformation's immediate Children. Whole-network
 * reachability is projected onto those Children, so a path may leave the
 * container through an external boundary and return before its local target. */
export function arrangeNylonContainer(
  doc: NylonDocument,
  projection: NylonProjection,
  containerId: string,
  direction: NylonDagDirection,
): NylonResult {
  const container = projection.nodes.find((node): node is Extract<NylonRenderNode, { kind: 'container' }> => (
    node.kind === 'container' && node.item.id === containerId
  ));
  if (!container) return { ok: false, error: `Parent Transformation "${containerId}" is not visible` };

  const { units, unitByChild } = unitsForContainer(projection, container);
  if (units.length === 0) return { ok: true, doc };
  const items = itemMap(doc);
  const boundaryUnits = boundaryLayoutUnits(doc, items, containerId, unitByChild);
  units.push(...boundaryUnits);
  const unitIds = new Set(units.map((unit) => unit.id));
  const boundaryShortcuts = new Set(boundaryUnits.map((unit) => `${unit.source}->${unit.target}`));
  const edges = [
    ...reachabilityEdges(doc, items, containerId, unitByChild, unitIds)
      .filter((edge) => !boundaryShortcuts.has(`${edge.source}->${edge.target}`)),
    ...boundaryUnits.flatMap((unit): LayoutEdge[] => [
      { source: unit.source, target: unit.id },
      { source: unit.id, target: unit.target },
    ]),
  ];
  const layoutNodes: TidyNode[] = units.map((unit) => ({
    id: unit.id,
    w: unit.w,
    h: unit.h,
    parentId: null,
  }));
  const positions = dagLayout(layoutNodes, edges, { ...NYLON_DAG_LAYOUT, direction });
  const nextPositions = new Map<string, { x: number; y: number }>();
  for (const unit of units) {
    const position = positions.get(unit.id);
    if (!position) continue;
    const unitX = CONTAINER_PADDING + position.x;
    const unitY = CONTAINER_HEADER + CONTAINER_PADDING + position.y;
    for (const member of unit.members) {
      nextPositions.set(member.id, {
        x: unitX + member.offsetX,
        y: unitY + member.offsetY,
      });
    }
  }

  return {
    ok: true,
    doc: {
      ...doc,
      transformations: doc.transformations.map((item) => {
        const position = nextPositions.get(item.id);
        return position ? { ...item, ...position } : item;
      }),
      contracts: doc.contracts.map((item) => {
        const position = nextPositions.get(item.id);
        return position ? { ...item, ...position } : item;
      }),
    },
  };
}
