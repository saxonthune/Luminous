// Phase B of the layout partition (doc01.07.04 R27-R30): an arrange command
// is a one-shot doc -> doc mutation that bakes `manual` positions (Phase A's
// NodePosition representation, see projection.ts). It is not a persistent
// constraint — "Column" is forgotten once this returns.
import type { AtlasDocument, SetNodeAction } from '@luminous/core/atlas';
import { setNode } from '@luminous/core/atlas';
import { projectAtlasNodes, childArea, type AtlasRenderNode } from './projection.ts';

const LINE_GAP = 24;
const MAX_SHIFT_TRIES = 20;
/** Minimum separation Remove Overlap pushes overlapping Nodes out to. */
const OVERLAP_GAP = 12;
/** Cap on separation passes — each pass resolves every overlapping pair once,
 * and a push can create a new overlap that the next pass resolves. */
const MAX_SEPARATION_PASSES = 50;

type LineAxis = 'column' | 'row';

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
 * Stacks the Nodes in `ids` into a line along `axis` and bakes each as a
 * `manual` position (R27). Precondition (caller-guaranteed via `sameParent`):
 * all `ids` share one parent. Ordered by current position on the line's axis
 * (stable); the line anchors at the selection's min x/y. Shifts the whole
 * line sideways (a column right, a row down), in bounded steps, past any
 * non-selected sibling it would otherwise overlap (R30 v1) — this is
 * deliberately dumb, not a packing algorithm (see the task's Do NOT).
 */
function arrangeAsLine(doc: AtlasDocument, ids: string[], axis: LineAxis): AtlasDocument {
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
  // Stored positions are relative to the parent's child area, not its
  // top-left corner — matches applyDrop/endDrag's childAreaOrigin inverse.
  const parentAbs = parentRn ? childArea(parentRn) : { x: 0, y: 0 };

  const ordered = [...selected].sort(
    axis === 'column' ? (a, b) => a.y - b.y : (a, b) => a.x - b.x,
  );
  const anchorX = Math.min(...ordered.map((rn) => rn.x));
  const anchorY = Math.min(...ordered.map((rn) => rn.y));
  const runLength =
    ordered.reduce((sum, rn) => sum + (axis === 'column' ? rn.h : rn.w), 0)
    + LINE_GAP * (ordered.length - 1);
  const lineW = axis === 'column' ? Math.max(...ordered.map((rn) => rn.w)) : runLength;
  const lineH = axis === 'column' ? runLength : Math.max(...ordered.map((rn) => rn.h));

  const siblings = rendered.filter((rn) => rn.node.parent === parentId && !idSet.has(rn.node.id));

  let x = anchorX;
  let y = anchorY;
  for (let attempt = 0; attempt < MAX_SHIFT_TRIES; attempt++) {
    const rect = { x, y, w: lineW, h: lineH };
    if (!siblings.some((sib) => rectsOverlap(rect, sib))) break;
    if (axis === 'column') x += lineW + LINE_GAP;
    else y += lineH + LINE_GAP;
  }

  let nextDoc = doc;
  let along = axis === 'column' ? y : x;
  for (const rn of ordered) {
    const pos = axis === 'column'
      ? { x: x - parentAbs.x, y: along - parentAbs.y }
      : { x: along - parentAbs.x, y: y - parentAbs.y };
    const result = setNode(nextDoc, rn.node.id, pos);
    if (result.ok) nextDoc = result.doc;
    along += (axis === 'column' ? rn.h : rn.w) + LINE_GAP;
  }
  return nextDoc;
}

export function arrangeAsColumn(doc: AtlasDocument, ids: string[]): AtlasDocument {
  return arrangeAsLine(doc, ids, 'column');
}

export function arrangeAsRow(doc: AtlasDocument, ids: string[]): AtlasDocument {
  return arrangeAsLine(doc, ids, 'row');
}

/** An arrange/remove-overlap result's x/y writes as an `AtlasAction[]`, for
 * routing the command through the history-recording dispatch seam instead of
 * applying the Document directly. Only Nodes whose stored position actually
 * changed are written. */
function diffPositionActions(before: AtlasDocument, after: AtlasDocument): SetNodeAction[] {
  if (after === before) return [];
  const beforeById = new Map(before.nodes.map((n) => [n.id, n]));
  return after.nodes
    .filter((n) => {
      const prev = beforeById.get(n.id);
      return prev !== undefined && (prev.x !== n.x || prev.y !== n.y);
    })
    .map((n) => ({ type: 'setNode', id: n.id, x: n.x, y: n.y }));
}

export function buildArrangeAsColumnActions(doc: AtlasDocument, ids: string[]): SetNodeAction[] {
  return diffPositionActions(doc, arrangeAsColumn(doc, ids));
}

export function buildArrangeAsRowActions(doc: AtlasDocument, ids: string[]): SetNodeAction[] {
  return diffPositionActions(doc, arrangeAsRow(doc, ids));
}

/**
 * Pushes overlapping siblings apart until no two overlap (doc01.07.04
 * R97/R98). Operates on the Children of `parentId` (or the top-level Nodes
 * when `undefined`) — overlap between a Container and its own descendants is
 * containment, never separated. Simple iterative pairwise separation: each
 * overlapping pair is pushed apart along its axis of least penetration, half
 * each way, out to OVERLAP_GAP; passes repeat until stable. Not a
 * constraint-solving layout (VPSC/PRISM) — same "deliberately dumb" tier as
 * arrange. Positions are baked as `manual`; a Container parent then grows
 * through the ordinary shrink-wrap chain.
 */
export function removeOverlap(doc: AtlasDocument, parentId: string | undefined): AtlasDocument {
  const rendered = projectAtlasNodes(doc);
  const siblings = rendered.filter((rn) => rn.node.parent === parentId);
  if (siblings.length < 2) return doc;

  const rects = siblings.map((rn) => ({ x: rn.x, y: rn.y, w: rn.w, h: rn.h }));
  let anyMoved = false;
  for (let pass = 0; pass < MAX_SEPARATION_PASSES; pass++) {
    let movedThisPass = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const penX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const penY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (penX <= 0 || penY <= 0) continue;
        const pushX = penX + OVERLAP_GAP;
        const pushY = penY + OVERLAP_GAP;
        if (pushX <= pushY) {
          const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? 1 : -1;
          a.x -= (dir * pushX) / 2;
          b.x += (dir * pushX) / 2;
        } else {
          const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? 1 : -1;
          a.y -= (dir * pushY) / 2;
          b.y += (dir * pushY) / 2;
        }
        movedThisPass = true;
        anyMoved = true;
      }
    }
    if (!movedThisPass) break;
  }
  if (!anyMoved) return doc;

  const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
  const parentRn = parentId ? byId.get(parentId) : undefined;
  const parentAbs = parentRn ? childArea(parentRn) : { x: 0, y: 0 };

  // Inside a Container, stored positions must stay non-negative (the child
  // area only grows right/down), so a push past the top-left edge shifts the
  // whole set back in instead — the Container grows on the far sides.
  let shiftX = 0;
  let shiftY = 0;
  if (parentId !== undefined) {
    for (const r of rects) {
      shiftX = Math.max(shiftX, parentAbs.x - r.x);
      shiftY = Math.max(shiftY, parentAbs.y - r.y);
    }
  }

  let nextDoc = doc;
  for (let i = 0; i < siblings.length; i++) {
    const rn = siblings[i];
    const r = rects[i];
    const x = Math.round(r.x + shiftX - parentAbs.x);
    const y = Math.round(r.y + shiftY - parentAbs.y);
    if (x === Math.round(rn.x - parentAbs.x) && y === Math.round(rn.y - parentAbs.y)) continue;
    const result = setNode(nextDoc, rn.node.id, { x, y });
    if (result.ok) nextDoc = result.doc;
  }
  return nextDoc;
}

export function buildRemoveOverlapActions(doc: AtlasDocument, parentId: string | undefined): SetNodeAction[] {
  return diffPositionActions(doc, removeOverlap(doc, parentId));
}
