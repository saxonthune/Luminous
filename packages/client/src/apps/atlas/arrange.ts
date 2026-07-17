// Phase B of the layout partition (doc01.07.04 R27-R30): an arrange command
// is a one-shot doc -> doc mutation that bakes `manual` positions (Phase A's
// NodePosition representation, see projection.ts). It is not a persistent
// constraint — "Column" is forgotten once this returns.
import type { AtlasDocument, SetNodeAction } from '@luminous/core/atlas';
import { setNode } from '@luminous/core/atlas';
import { projectAtlasNodes, type AtlasRenderNode } from './projection.ts';

const COLUMN_GAP = 24;
const MAX_SHIFT_TRIES = 20;

/** Whether every id in `ids` shares the same `parent` (R29's enable rule). */
export function sameParent(doc: AtlasDocument, ids: string[]): boolean {
  if (ids.length < 2) return true;
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const parent = byId.get(ids[0])?.parent;
  return ids.every((id) => byId.get(id)?.parent === parent);
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Stacks the Nodes in `ids` into a vertical column and bakes each as a
 * `manual` position (R27). Precondition (caller-guaranteed via `sameParent`):
 * all `ids` share one parent. Ordered by current y (stable); column x is the
 * min current x of the selection. Shifts the whole column right, in bounded
 * steps, past any non-selected sibling it would otherwise overlap (R30 v1) —
 * this is deliberately dumb, not a packing algorithm (see the task's Do NOT).
 */
export function arrangeAsColumn(doc: AtlasDocument, ids: string[]): AtlasDocument {
  if (ids.length < 2) return doc;

  const rendered = projectAtlasNodes(doc);
  const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
  const idSet = new Set(ids);

  const selected = ids
    .map((id) => byId.get(id))
    .filter((rn): rn is AtlasRenderNode => rn !== undefined);
  if (selected.length < 2) return doc;

  const parentId = selected[0].node.parent;
  const parentRn = parentId ? byId.get(parentId) : undefined;
  const parentAbs = parentRn ? { x: parentRn.x, y: parentRn.y } : { x: 0, y: 0 };

  const ordered = [...selected].sort((a, b) => a.y - b.y);
  const columnWidth = Math.max(...ordered.map((rn) => rn.w));
  const anchorX = Math.min(...ordered.map((rn) => rn.x));
  const anchorY = Math.min(...ordered.map((rn) => rn.y));
  const columnHeight =
    ordered.reduce((sum, rn) => sum + rn.h, 0) + COLUMN_GAP * (ordered.length - 1);

  const siblings = rendered.filter((rn) => rn.node.parent === parentId && !idSet.has(rn.node.id));

  let x = anchorX;
  for (let attempt = 0; attempt < MAX_SHIFT_TRIES; attempt++) {
    const rect = { x, y: anchorY, w: columnWidth, h: columnHeight };
    if (!siblings.some((sib) => rectsOverlap(rect, sib))) break;
    x += columnWidth + COLUMN_GAP;
  }

  let nextDoc = doc;
  let y = anchorY;
  for (const rn of ordered) {
    const result = setNode(nextDoc, rn.node.id, { x: x - parentAbs.x, y: y - parentAbs.y });
    if (result.ok) nextDoc = result.doc;
    y += rn.h + COLUMN_GAP;
  }
  return nextDoc;
}

/** `arrangeAsColumn`'s x/y writes as an `AtlasAction[]`, for routing the
 * command through the history-recording dispatch seam instead of applying
 * the Document directly. */
export function buildArrangeAsColumnActions(doc: AtlasDocument, ids: string[]): SetNodeAction[] {
  const next = arrangeAsColumn(doc, ids);
  if (next === doc) return [];
  const byId = new Map(next.nodes.map((n) => [n.id, n]));
  return ids.map((id) => {
    const n = byId.get(id)!;
    return { type: 'setNode', id, x: n.x, y: n.y };
  });
}
