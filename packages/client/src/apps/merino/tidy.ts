// Tidy commands are one-shot doc -> doc mutations over a freeform Container's
// children, baking new positions. Two of them:
//   - buildRemoveOverlapActions: pushes overlapping children apart, no sense of
//     direction (copied from Atlas's removeOverlap, apps/atlas/arrange.ts).
//   - buildFlowLayoutActions: ranks children into rows so directed Edges flow
//     downward — the layered (Sugiyama-style) layout, applied to one Container.
// Both write in Merino's coordinate model: a contained child's stored x/y is
// relative to its Container's child area, not the canvas origin.
import type { MerinoAction, MerinoDocument } from '@luminous/core/merino';
import { childAreaOrigin, projectMerino } from './projection.ts';

/** Minimum separation an overlapping pair is pushed out to. */
const OVERLAP_GAP = 12;
/** Cap on separation passes — each pass resolves every overlapping pair once,
 * and a push can create a new overlap that the next pass resolves. */
const MAX_SEPARATION_PASSES = 50;

/** Vertical gap between rank rows in the flow layout. */
const RANK_GAP = 64;
/** Horizontal gap between siblings sharing a rank row in the flow layout. */
const FLOW_GAP = 32;
/** Barycenter ordering sweeps (down, up, down, up). Each pass reorders every
 * row by the mean position of its neighbours in the adjacent row; a handful of
 * alternating sweeps settles the crossing count without a full solver. */
const BARYCENTER_SWEEPS = 4;

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

/**
 * Ranks the direct children of a freeform Container into stacked rows so that
 * directed Edges flow downward — the layered (Sugiyama-style) graph layout,
 * scoped to one Container. Returns the position writes as setNode actions; a
 * `list` Container, or one with fewer than two children, is a no-op.
 *
 * The sort key is the Edges, never the node Type. An Edge whose endpoints are
 * nested deeper than this Container's own children is *lifted*: each endpoint
 * counts for the direct child it descends from, so an Edge from a leaf to a
 * Requirement buried inside a breakout Container still orders the leaf against
 * that breakout. A directed Edge places its target one row below its source
 * (source on top), so a Container's arrows define which way "down" runs.
 *
 * Three phases:
 *  1. Rank — longest-path layering over the net edge direction between children
 *     (ties cast no constraint). A child's row is one below the deepest source
 *     that reaches it, so a child shared by several branches settles in the one
 *     row consistent with all of them.
 *  2. Order — within each row, sort by the barycenter (mean neighbour position)
 *     of the adjacent row, sweeping down then up to reduce crossings.
 *  3. Place — stack rows top-to-bottom, lay each row left-to-right by its order,
 *     using every child's rendered width and height.
 */
export function buildFlowLayoutActions(doc: MerinoDocument, containerId: string): MerinoAction[] {
  const container = doc.nodes.find((n) => n.id === containerId);
  if (!container) return [];
  const rendered = projectMerino(doc, container.tab).nodes;
  const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
  const parentRn = byId.get(containerId);
  if (!parentRn || !parentRn.isContainer || parentRn.isList) return [];

  const children = rendered.filter((rn) => rn.contained && rn.node.parent === containerId);
  if (children.length < 2) return [];
  const childIds = children.map((rn) => rn.node.id);
  const childSet = new Set(childIds);

  // Lift any Node on this Tab to the direct child of the Container it descends
  // from (itself if it already is that child), or undefined if it lies outside.
  const parentOf = new Map(rendered.map((rn) => [rn.node.id, rn.node.parent]));
  const liftTo = (id: string): string | undefined => {
    let current: string | undefined = id;
    while (current !== undefined) {
      const p = parentOf.get(current);
      if (p === containerId) return current;
      current = p;
    }
    return undefined;
  };

  // Tally lifted Edge directions between children, then keep only the net
  // winner of each pair (a tie leaves the pair unconstrained). Only a directed
  // Edge Type constrains the flow; an undirected one casts no vote.
  const directedTypes = new Set(doc.edgeTypes.filter((t) => t.directed).map((t) => t.id));
  const voteKey = (a: string, b: string) => `${a}\t${b}`;
  const votes = new Map<string, number>();
  for (const e of doc.edges) {
    if (e.tab !== container.tab || !directedTypes.has(e.type)) continue;
    const a = liftTo(e.from);
    const b = liftTo(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    if (!childSet.has(a) || !childSet.has(b)) continue;
    votes.set(voteKey(a, b), (votes.get(voteKey(a, b)) ?? 0) + 1);
  }

  const succ = new Map<string, Set<string>>();
  const pred = new Map<string, Set<string>>();
  for (const id of childIds) { succ.set(id, new Set()); pred.set(id, new Set()); }
  for (let i = 0; i < childIds.length; i++) {
    for (let j = i + 1; j < childIds.length; j++) {
      const a = childIds[i];
      const b = childIds[j];
      const ab = votes.get(voteKey(a, b)) ?? 0;
      const ba = votes.get(voteKey(b, a)) ?? 0;
      if (ab > ba) { succ.get(a)!.add(b); pred.get(b)!.add(a); }
      else if (ba > ab) { succ.get(b)!.add(a); pred.get(a)!.add(b); }
    }
  }

  // Phase 1 — longest-path rank via Kahn's algorithm. A child with no
  // predecessor starts at row 0; each edge relaxes its target down by one.
  const rank = new Map<string, number>();
  const indegree = new Map<string, number>();
  for (const id of childIds) indegree.set(id, pred.get(id)!.size);
  const queue: string[] = [];
  for (const id of childIds) if (indegree.get(id) === 0) { rank.set(id, 0); queue.push(id); }
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    const ru = rank.get(u)!;
    for (const v of succ.get(u)!) {
      rank.set(v, Math.max(rank.get(v) ?? 0, ru + 1));
      indegree.set(v, indegree.get(v)! - 1);
      if (indegree.get(v) === 0) queue.push(v);
    }
  }
  // A directed cycle leaves nodes unreached by Kahn — floor them at row 0.
  for (const id of childIds) if (!rank.has(id)) rank.set(id, 0);

  const rows = new Map<number, string[]>();
  for (const id of childIds) {
    const r = rank.get(id)!;
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r)!.push(id);
  }
  const sortedRanks = [...rows.keys()].sort((a, b) => a - b);

  // Phase 2 — barycenter ordering. Seed each row's order by current position so
  // an already-tidy graph stays put, then sweep.
  const orderIndex = new Map<string, number>();
  for (const r of sortedRanks) {
    const row = rows.get(r)!;
    row.sort((a, b) => (byId.get(a)!.x - byId.get(b)!.x) || (byId.get(a)!.y - byId.get(b)!.y));
    row.forEach((id, i) => orderIndex.set(id, i));
  }
  const barycenter = (id: string, neighbours: Set<string>): number => {
    let sum = 0;
    let count = 0;
    for (const m of neighbours) {
      const p = orderIndex.get(m);
      if (p !== undefined) { sum += p; count += 1; }
    }
    return count === 0 ? orderIndex.get(id)! : sum / count;
  };
  for (let sweep = 0; sweep < BARYCENTER_SWEEPS; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? sortedRanks : [...sortedRanks].reverse();
    for (const r of order) {
      const row = rows.get(r)!;
      const key = new Map<string, number>();
      for (const id of row) key.set(id, barycenter(id, down ? pred.get(id)! : succ.get(id)!));
      row.sort((a, b) => (key.get(a)! - key.get(b)!) || (orderIndex.get(a)! - orderIndex.get(b)!));
      row.forEach((id, i) => orderIndex.set(id, i));
    }
  }

  // Phase 3 — place. Stack rows; lay each left-to-right in the child-area frame,
  // whose top-left is (0, 0), so every position is non-negative by construction.
  const origin = childAreaOrigin(parentRn.node);
  const originX = parentRn.x + origin.x;
  const originY = parentRn.y + origin.y;
  const actions: MerinoAction[] = [];
  let curY = 0;
  for (const r of sortedRanks) {
    const row = rows.get(r)!;
    let curX = 0;
    let rowHeight = 0;
    for (const id of row) {
      const rn = byId.get(id)!;
      const x = Math.round(curX);
      const y = Math.round(curY);
      if (x !== Math.round(rn.x - originX) || y !== Math.round(rn.y - originY)) {
        actions.push({ type: 'setNode', id, x, y });
      }
      curX += rn.w + FLOW_GAP;
      rowHeight = Math.max(rowHeight, rn.h);
    }
    curY += rowHeight + RANK_GAP;
  }
  return actions;
}
