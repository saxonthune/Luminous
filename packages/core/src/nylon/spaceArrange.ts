import type { NylonDocument, NylonResult } from './types.ts';
import { resolveRectangleOverlaps, spaceRectangles } from '@luminous/cactus/layout';
import {
  CONTAINER_HEADER,
  CONTAINER_PADDING,
  projectNylon,
  type NylonProjection,
  type NylonRenderNode,
} from './projection.ts';

export const NYLON_SPACE_LAYOUT = {
  gap: 72,
} as const;

interface GeometryMember {
  id: string;
  offsetX: number;
  offsetY: number;
}

interface GeometryUnit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  members: GeometryMember[];
}

function cloneDocument(doc: NylonDocument): NylonDocument {
  return {
    ...doc,
    transformations: doc.transformations.map((item) => ({ ...item })),
    contracts: doc.contracts.map((item) => ({ ...item })),
    arcs: doc.arcs,
  };
}

function geometryUnitsAtParent(
  projection: NylonProjection,
  parent: string | undefined,
): GeometryUnit[] {
  const nodes = projection.nodes.filter((node) => (
    !('boundaryContainerId' in node) && node.item.parent === parent
  ));
  const nodeById = new Map(nodes.map((node) => [node.item.id, node]));
  const paired = new Set<string>();
  const pairUnits = projection.contractFrames.flatMap((frame): GeometryUnit[] => {
    if (frame.boundaryContainerId) return [];
    const input = nodeById.get(frame.input);
    const output = nodeById.get(frame.output);
    if (!input || !output) return [];
    paired.add(input.item.id);
    paired.add(output.item.id);
    return [{
      id: frame.id,
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      members: [input, output].map((node) => ({
        id: node.item.id,
        offsetX: node.x - frame.x,
        offsetY: node.y - frame.y,
      })),
    }];
  });
  const nodeUnits = nodes
    .filter((node) => !paired.has(node.item.id))
    .map((node): GeometryUnit => ({
      id: node.item.id,
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      members: [{ id: node.item.id, offsetX: 0, offsetY: 0 }],
    }));
  return [...nodeUnits, ...pairUnits];
}

function translateUnit(doc: NylonDocument, unit: GeometryUnit, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  const ids = new Set(unit.members.map((member) => member.id));
  for (const item of [...doc.transformations, ...doc.contracts]) {
    if (!ids.has(item.id)) continue;
    item.x = (item.x ?? 0) + dx;
    item.y = (item.y ?? 0) + dy;
  }
}

function containerNode(
  projection: NylonProjection,
  id: string,
): Extract<NylonRenderNode, { kind: 'container' }> | undefined {
  return projection.nodes.find((node): node is Extract<NylonRenderNode, { kind: 'container' }> => (
    node.kind === 'container' && node.item.id === id
  ));
}

/** Space one container's direct geometry units, then clear sibling overlaps at every ancestor. */
export function spaceNylonContainer(
  source: NylonDocument,
  initialProjection: NylonProjection,
  containerId: string,
  collapsedIds: ReadonlySet<string> = new Set<string>(),
  coveredIds: ReadonlySet<string> = new Set<string>(),
): NylonResult {
  const container = containerNode(initialProjection, containerId);
  if (!container) return { ok: false, error: `Parent Transformation "${containerId}" is not visible` };
  const initialUnits = geometryUnitsAtParent(initialProjection, containerId);
  if (initialUnits.length === 0) return { ok: true, doc: source };

  const next = cloneDocument(source);
  const spaced = new Map(spaceRectangles(
    initialUnits.map((unit) => ({
      id: unit.id,
      x: unit.x,
      y: unit.y,
      width: unit.w,
      height: unit.h,
    })),
    {
      gap: NYLON_SPACE_LAYOUT.gap,
      origin: {
        x: container.x + CONTAINER_PADDING,
        y: container.y + CONTAINER_HEADER + CONTAINER_PADDING,
      },
    },
  ).map((position) => [position.id, position]));
  let changed = false;
  for (const unit of initialUnits) {
    const position = spaced.get(unit.id);
    if (!position) continue;
    const dx = position.x - unit.x;
    const dy = position.y - unit.y;
    translateUnit(next, unit, dx, dy);
    changed = changed || dx !== 0 || dy !== 0;
  }

  const transformations = new Map(next.transformations.map((item) => [item.id, item]));
  let sourceId: string | undefined = containerId;
  while (sourceId !== undefined) {
    const parent: string | undefined = transformations.get(sourceId)?.parent;
    const projection = projectAfterChanges(next, collapsedIds, coveredIds);
    const units = geometryUnitsAtParent(projection, parent);
    const sourceUnit = units.find((unit) => unit.members.some((member) => member.id === sourceId));
    if (!sourceUnit) break;
    const resolved = new Map(resolveRectangleOverlaps(
      units.map((unit) => ({
        id: unit.id,
        x: unit.x,
        y: unit.y,
        width: unit.w,
        height: unit.h,
      })),
      sourceUnit.id,
      NYLON_SPACE_LAYOUT.gap,
    ).map((position) => [position.id, position]));
    for (const unit of units) {
      const position = resolved.get(unit.id);
      if (!position) continue;
      const dx = position.x - unit.x;
      const dy = position.y - unit.y;
      translateUnit(next, unit, dx, dy);
      changed = changed || dx !== 0 || dy !== 0;
    }
    sourceId = parent;
  }
  return { ok: true, doc: changed ? next : source };
}

// Kept behind a function so every ancestor pass measures the geometry produced
// by the preceding translations.
function projectAfterChanges(doc: NylonDocument, collapsedIds: ReadonlySet<string>, coveredIds: ReadonlySet<string>): NylonProjection {
  return projectNylon(doc, collapsedIds, undefined, undefined, coveredIds);
}
