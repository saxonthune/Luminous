import { checkNylonDocument } from './check.ts';
import type { NylonContract, NylonDocument, NylonTransformation } from './types.ts';

export interface NylonDoctorRepair {
  code: string;
  message: string;
}

export type NylonDoctorResult =
  | { ok: true; doc: NylonDocument; repairs: NylonDoctorRepair[] }
  | { ok: false; error: string };

type NylonItem = NylonTransformation | NylonContract;

function cloneDocument(doc: NylonDocument): NylonDocument {
  return {
    ...doc,
    transformations: doc.transformations.map((item) => ({
      ...item,
      ...(item.needs === undefined ? {} : { needs: [...item.needs] }),
      ...(item.contractPair === undefined ? {} : { contractPair: { ...item.contractPair } }),
    })),
    contracts: doc.contracts.map((item) => ({ ...item })),
    arcs: doc.arcs.map((arc) => ({ ...arc })),
  };
}

function absolutePosition(items: ReadonlyMap<string, NylonItem>, id: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let item = items.get(id);
  const seen = new Set<string>();
  while (item !== undefined && !seen.has(item.id)) {
    seen.add(item.id);
    x += item.x ?? 0;
    y += item.y ?? 0;
    item = item.parent === undefined ? undefined : items.get(item.parent);
  }
  return { x, y };
}

/** Repair every unambiguous whole-document invariant without arranging valid Nodes. */
export function doctorNylonDocument(source: NylonDocument): NylonDoctorResult {
  const doc = cloneDocument(source);
  const repairs: NylonDoctorRepair[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const item of [...doc.transformations, ...doc.contracts]) {
    if (seenIds.has(item.id)) duplicateIds.add(item.id);
    seenIds.add(item.id);
  }
  if (duplicateIds.size > 0) {
    return {
      ok: false,
      error: `Doctor cannot safely disambiguate duplicate ids: ${[...duplicateIds].map((id) => `"${id}"`).join(', ')}`,
    };
  }

  const transformations = new Map(doc.transformations.map((item) => [item.id, item]));
  const allItems = (): Map<string, NylonItem> => new Map([
    ...doc.transformations.map((item) => [item.id, item] as const),
    ...doc.contracts.map((item) => [item.id, item] as const),
  ]);

  for (const item of [...doc.transformations, ...doc.contracts]) {
    if (item.parent !== undefined && !transformations.has(item.parent)) {
      repairs.push({ code: 'orphan-parent', message: `Moved "${item.id}" to the document root because parent "${item.parent}" does not exist` });
      delete item.parent;
    }
  }

  for (const transformation of doc.transformations) {
    const visited = new Set<string>();
    let current: NylonTransformation | undefined = transformation;
    while (current !== undefined) {
      if (visited.has(current.id)) {
        repairs.push({ code: 'parent-cycle', message: `Moved "${transformation.id}" to the document root to break a parent cycle` });
        delete transformation.parent;
        break;
      }
      visited.add(current.id);
      current = current.parent === undefined ? undefined : transformations.get(current.parent);
    }
  }

  const contracts = new Map(doc.contracts.map((item) => [item.id, item]));
  for (const transformation of doc.transformations) {
    const pair = transformation.contractPair;
    if (!pair) continue;
    const input = contracts.get(pair.input);
    const output = contracts.get(pair.output);
    if (!input || !output || input.id === output.id) {
      repairs.push({ code: 'contract-pair', message: `Cleared the invalid Contract Pair from "${transformation.id}"` });
      delete transformation.contractPair;
      continue;
    }
    if (input.parent !== output.parent) {
      const items = allItems();
      const before = absolutePosition(items, output.id);
      const parentPosition = input.parent === undefined ? { x: 0, y: 0 } : absolutePosition(items, input.parent);
      output.parent = input.parent;
      output.x = before.x - parentPosition.x;
      output.y = before.y - parentPosition.y;
      repairs.push({ code: 'contract-pair-parent', message: `Moved "${output.id}" into the coordinate space of "${input.id}"` });
    }
  }

  let completedCoordinates = 0;
  for (const item of [...doc.transformations, ...doc.contracts]) {
    if (item.x === undefined) {
      item.x = 0;
      completedCoordinates += 1;
    }
    if (item.y === undefined) {
      item.y = 0;
      completedCoordinates += 1;
    }
  }
  if (completedCoordinates > 0) {
    repairs.push({ code: 'missing-coordinate', message: 'Filled missing Node coordinates with zero in their existing coordinate spaces' });
  }

  const depthOf = (item: NylonItem): number => {
    let depth = 0;
    let parent = item.parent;
    const seen = new Set<string>();
    while (parent !== undefined && !seen.has(parent)) {
      seen.add(parent);
      depth += 1;
      parent = transformations.get(parent)?.parent;
    }
    return depth;
  };
  const parentsDeepestFirst = doc.transformations
    .filter((candidate) => [...doc.transformations, ...doc.contracts].some((item) => item.parent === candidate.id))
    .sort((a, b) => depthOf(b) - depthOf(a));
  for (const parent of parentsDeepestFirst) {
    const children = [...doc.transformations, ...doc.contracts].filter((item) => item.parent === parent.id);
    const minX = Math.min(...children.map((item) => item.x ?? 0));
    const minY = Math.min(...children.map((item) => item.y ?? 0));
    const dx = Math.max(0, -minX);
    const dy = Math.max(0, -minY);
    if (dx === 0 && dy === 0) continue;
    parent.x = (parent.x ?? 0) - dx;
    parent.y = (parent.y ?? 0) - dy;
    for (const child of children) {
      child.x = (child.x ?? 0) + dx;
      child.y = (child.y ?? 0) + dy;
    }
    repairs.push({ code: 'coordinate-frame', message: `Normalized negative Child coordinates inside "${parent.id}" without moving its descendants on the canvas` });
  }

  const kinds = new Map<string, 'transformation' | 'contract'>([
    ...doc.transformations.map((item) => [item.id, 'transformation'] as const),
    ...doc.contracts.map((item) => [item.id, 'contract'] as const),
  ]);
  const parentIds = new Set(
    [...doc.transformations, ...doc.contracts]
      .map((item) => item.parent)
      .filter((id): id is string => id !== undefined),
  );
  const arcKeys = new Set<string>();
  doc.arcs = doc.arcs.filter((arc) => {
    const key = `${arc.from}\0${arc.to}`;
    const fromKind = kinds.get(arc.from);
    const toKind = kinds.get(arc.to);
    const reason = arcKeys.has(key) ? 'duplicates another Arc'
      : fromKind === undefined || toKind === undefined ? 'references an unknown Node'
        : fromKind === toKind ? 'does not alternate between a Contract and Transformation'
          : parentIds.has(arc.from) || parentIds.has(arc.to) ? 'uses a Parent Transformation as an endpoint'
            : undefined;
    arcKeys.add(key);
    if (reason === undefined) return true;
    repairs.push({ code: 'arc', message: `Removed Arc "${arc.from}" -> "${arc.to}" because it ${reason}` });
    return false;
  });

  const remainingErrors = checkNylonDocument(doc).filter((issue) => issue.severity === 'error');
  if (remainingErrors.length > 0) {
    return { ok: false, error: `Doctor could not repair the Document: ${remainingErrors.map((issue) => issue.message).join('; ')}` };
  }
  return { ok: true, doc, repairs };
}
