import type { NylonDocument, NylonResult } from './types.ts';
import { translateNylonItem } from './operations.ts';

/** Selected Nodes with no selected ancestor. Moving only these roots prevents
 * a selected descendant from receiving the same translation twice. */
export function nylonSelectionRoots(doc: NylonDocument, ids: ReadonlyArray<string>): string[] {
  const items = new Map([
    ...doc.transformations.map((item) => [item.id, item] as const),
    ...doc.contracts.map((item) => [item.id, item] as const),
  ]);
  const selected = new Set(ids);
  return ids.filter((id) => {
    let parent = items.get(id)?.parent;
    const seen = new Set<string>();
    while (parent !== undefined && !seen.has(parent)) {
      if (selected.has(parent)) return false;
      seen.add(parent);
      parent = items.get(parent)?.parent;
    }
    return true;
  });
}

/** Translate several roots atomically from the caller's perspective. */
export function translateNylonSelection(
  doc: NylonDocument,
  ids: ReadonlyArray<string>,
  dx: number,
  dy: number,
): NylonResult {
  let current = doc;
  for (const id of ids) {
    const result = translateNylonItem(current, id, dx, dy);
    if (!result.ok) return result;
    current = result.doc;
  }
  return { ok: true, doc: current };
}
