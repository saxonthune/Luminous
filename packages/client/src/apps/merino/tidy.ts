// A tidy command is a one-shot doc -> doc mutation that pushes a freeform
// Container's children apart until none overlap, baking the new positions.
// Copied from Atlas's removeOverlap (apps/atlas/arrange.ts) and adapted to
// Merino's coordinate model: a contained child's stored x/y is relative to its
// Container's child area, not the canvas origin.
import type { MerinoAction, MerinoDocument } from '@luminous/core/merino';
import { childAreaOrigin, projectMerino } from './projection.ts';

/** Minimum separation an overlapping pair is pushed out to. */
const OVERLAP_GAP = 12;
/** Cap on separation passes — each pass resolves every overlapping pair once,
 * and a push can create a new overlap that the next pass resolves. */
const MAX_SEPARATION_PASSES = 50;

/**
 * Pushes the direct children of a freeform Container apart until no two
 * overlap, returning the position writes as setNode actions. List Containers
 * order their children themselves, so tidying one is a no-op. Simple iterative
 * pairwise separation: each overlapping pair is pushed apart along its axis of
 * least penetration, half each way, out to OVERLAP_GAP; passes repeat until
 * stable — the same "deliberately dumb" tier as Atlas's Remove Overlap, not a
 * constraint-solving layout. The Container then grows through the ordinary
 * grow-only chain in MerinoCanvas.dispatchAction.
 */
export function buildRemoveOverlapActions(doc: MerinoDocument, containerId: string): MerinoAction[] {
  const container = doc.nodes.find((n) => n.id === containerId);
  if (!container) return [];
  const rendered = projectMerino(doc, container.tab).nodes;
  const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
  const parentRn = byId.get(containerId);
  if (!parentRn || !parentRn.isContainer || parentRn.isList) return [];

  const children = rendered.filter((rn) => rn.contained && rn.node.parent === containerId);
  if (children.length < 2) return [];

  const rects = children.map((rn) => ({ x: rn.x, y: rn.y, w: rn.w, h: rn.h }));
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
  if (!anyMoved) return [];

  // Stored positions are relative to the Container's absolute child-area origin.
  const origin = childAreaOrigin(parentRn.node);
  const originX = parentRn.x + origin.x;
  const originY = parentRn.y + origin.y;

  // A contained child's stored x/y may never go negative — the child area only
  // grows right/down — so a push past the top-left edge shifts the whole set
  // back in instead, and the Container grows on the far sides.
  let shiftX = 0;
  let shiftY = 0;
  for (const r of rects) {
    shiftX = Math.max(shiftX, originX - r.x);
    shiftY = Math.max(shiftY, originY - r.y);
  }

  const actions: MerinoAction[] = [];
  for (let i = 0; i < children.length; i++) {
    const rn = children[i];
    const r = rects[i];
    const x = Math.round(r.x + shiftX - originX);
    const y = Math.round(r.y + shiftY - originY);
    if (x === Math.round(rn.x - originX) && y === Math.round(rn.y - originY)) continue;
    actions.push({ type: 'setNode', id: rn.node.id, x, y });
  }
  return actions;
}
