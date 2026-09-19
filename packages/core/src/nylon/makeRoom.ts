import type { NylonContract, NylonDocument, NylonTransformation } from './types.ts';
import { computeExpansionTranslations } from '@luminous/cactus/layout';
import { DISCLOSURE_GAP, projectNylon, type NylonProjection } from './projection.ts';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GeometryUnit extends Rect {
  id: string;
  members: string[];
}

type NylonItem = NylonTransformation | NylonContract;

function cloneDocument(doc: NylonDocument): NylonDocument {
  return {
    ...doc,
    transformations: doc.transformations.map((item) => ({ ...item })),
    contracts: doc.contracts.map((item) => ({ ...item })),
    arcs: doc.arcs,
  };
}

function unitsAtParent(
  projection: NylonProjection,
  parent: string | undefined,
): GeometryUnit[] {
  const visibleNodes = new Map(projection.nodes.map((node) => [node.item.id, node]));
  const pairedContracts = new Set<string>();
  const pairUnits = projection.contractFrames.flatMap((frame): GeometryUnit[] => {
    const input = visibleNodes.get(frame.input);
    const output = visibleNodes.get(frame.output);
    if (!input || !output || input.item.parent !== parent || output.item.parent !== parent) return [];
    pairedContracts.add(frame.input);
    pairedContracts.add(frame.output);
    return [{ ...frame, members: [frame.input, frame.output] }];
  });
  const nodeUnits = projection.nodes
    .filter((node) => node.item.parent === parent && !pairedContracts.has(node.item.id))
    .map((node): GeometryUnit => ({
      id: node.item.id,
      members: [node.item.id],
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
    }));
  return [...nodeUnits, ...pairUnits];
}

function translateMembers(doc: NylonDocument, members: readonly string[], dx: number, dy: number): void {
  const ids = new Set(members);
  for (const item of [...doc.transformations, ...doc.contracts]) {
    if (!ids.has(item.id)) continue;
    item.x = (item.x ?? 0) + dx;
    item.y = (item.y ?? 0) + dy;
  }
}

function makeRoomAtParent(
  doc: NylonDocument,
  projection: NylonProjection,
  parent: string | undefined,
  sourceId: string,
  sourceBefore: Rect,
): boolean {
  const units = unitsAtParent(projection, parent);
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const source = byId.get(sourceId);
  if (!source) return false;
  const translations = computeExpansionTranslations(
    units.map((unit) => ({
      id: unit.id,
      x: unit.x,
      y: unit.y,
      width: unit.w,
      height: unit.h,
    })),
    sourceId,
    { x: sourceBefore.x, y: sourceBefore.y, width: sourceBefore.w, height: sourceBefore.h },
    DISCLOSURE_GAP,
  );
  for (const translation of translations) {
    const unit = byId.get(translation.id);
    if (unit) translateMembers(doc, unit.members, translation.dx, translation.dy);
  }
  return translations.length > 0;
}

/** Persist the sibling translations required to reveal one collapsed Parent Transformation. */
export function makeRoomForExpansion(
  source: NylonDocument,
  transformationId: string,
  collapsedIds: ReadonlySet<string>,
  coveredIds: ReadonlySet<string> = new Set<string>(),
): NylonDocument {
  if (!collapsedIds.has(transformationId)) return source;
  const transformations = new Map(source.transformations.map((item) => [item.id, item]));
  if (!transformations.has(transformationId)) return source;

  const before = projectNylon(source, collapsedIds, undefined, undefined, coveredIds);
  const expandedIds = new Set(collapsedIds);
  expandedIds.delete(transformationId);
  const next = cloneDocument(source);
  const items = new Map<string, NylonItem>([
    ...next.transformations.map((item) => [item.id, item] as const),
    ...next.contracts.map((item) => [item.id, item] as const),
  ]);
  const beforeNodes = new Map(before.nodes.map((node) => [node.item.id, node]));
  let sourceId: string | undefined = transformationId;
  let moved = false;

  while (sourceId !== undefined) {
    const sourceBefore = beforeNodes.get(sourceId);
    if (!sourceBefore) break;
    const parent: string | undefined = items.get(sourceId)?.parent;
    const projection = projectNylon(next, expandedIds, undefined, undefined, coveredIds);
    moved = makeRoomAtParent(next, projection, parent, sourceId, sourceBefore) || moved;
    sourceId = parent;
  }
  return moved ? next : source;
}
