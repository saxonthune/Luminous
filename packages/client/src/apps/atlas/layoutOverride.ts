import { childAreaOrigin, shrinkWrapSize, type AtlasRenderNode } from './projection.ts';

/** A live geometric override for one Node: added to its committed rect before
 * paint, never written to the Document. */
export interface LayoutDelta {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const ZERO: LayoutDelta = { dx: 0, dy: 0, dw: 0, dh: 0 };

/** Mutably accumulates `d` into `map[id]`, so simultaneous gestures (e.g. a
 * Ctrl-drag's subtree shift and ancestor grow) compose additively instead of
 * overwriting each other. */
export function addDelta(map: Map<string, LayoutDelta>, id: string, d: Partial<LayoutDelta>): void {
  const cur = map.get(id) ?? ZERO;
  map.set(id, {
    dx: cur.dx + (d.dx ?? 0),
    dy: cur.dy + (d.dy ?? 0),
    dw: cur.dw + (d.dw ?? 0),
    dh: cur.dh + (d.dh ?? 0),
  });
}

/** `id` and every ancestor reached by following `parentOf` upward. */
export function selfAndAncestors(id: string, parentOf: Map<string, string>): string[] {
  const result = [id];
  let current = parentOf.get(id);
  while (current !== undefined) {
    result.push(current);
    current = parentOf.get(current);
  }
  return result;
}

/**
 * Adds `(dx, dy)` to `rootId` (when `includeRoot`, the default) and every
 * descendant reached by following `childrenOf` downward. A whole-subtree
 * drag uses `includeRoot: true`; a content-resize's children-follow-the-
 * header-grow uses `includeRoot: false` — the resized Node itself grows
 * rather than moves.
 */
export function shiftSubtree(
  map: Map<string, LayoutDelta>,
  rootId: string,
  childrenOf: Map<string, string[]>,
  dx: number,
  dy: number,
  opts?: { includeRoot?: boolean },
): void {
  if (dx === 0 && dy === 0) return;
  if (opts?.includeRoot ?? true) addDelta(map, rootId, { dx, dy });
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    addDelta(map, id, { dx, dy });
    for (const childId of childrenOf.get(id) ?? []) stack.push(childId);
  }
}

/**
 * Grows every ancestor on `nodeId`'s path to contain its live extent —
 * `ownDelta` is the geometric change already applied to `nodeId` itself
 * (a position shift for a Ctrl-drag, a height grow for a content-resize).
 * The same bottom-up walk serves both: each ancestor's new size is computed
 * from its committed children, substituting the path-child's live extent for
 * its committed one, via the shared `shrinkWrapSize` formula (single-sourced
 * with `projectAtlasNodes`'s `sizeOf`). Only the bottom level (`nodeId`'s
 * immediate parent) sees `ownDelta` directly — higher levels inherit it only
 * through the grown size already computed one level down.
 *
 * A negative `dx`/`dy`/`dw`/`dh` in `ownDelta` is clamped to 0: shrinking the
 * union or shifting a container's origin is out of scope — this only ever
 * grows a size, never shrinks it below committed.
 */
export function growAncestors(
  map: Map<string, LayoutDelta>,
  nodeId: string,
  parentOf: Map<string, string>,
  renderNodes: AtlasRenderNode[],
  ownDelta: Partial<{ dx: number; dy: number; dw: number; dh: number }>,
): void {
  const path = selfAndAncestors(nodeId, parentOf);
  if (path.length < 2) return;

  const byId = new Map(renderNodes.map((rn) => [rn.node.id, rn]));
  const childrenOf = new Map<string, string[]>();
  for (const rn of renderNodes) {
    if (rn.node.parent === undefined) continue;
    const list = childrenOf.get(rn.node.parent) ?? [];
    list.push(rn.node.id);
    childrenOf.set(rn.node.parent, list);
  }

  const effDx = Math.max(0, ownDelta.dx ?? 0);
  const effDy = Math.max(0, ownDelta.dy ?? 0);
  const effDw = Math.max(0, ownDelta.dw ?? 0);
  const effDh = Math.max(0, ownDelta.dh ?? 0);

  let pathChildId = path[0]!;
  let pathChildW = (byId.get(pathChildId)?.w ?? 0) + effDw;
  let pathChildH = (byId.get(pathChildId)?.h ?? 0) + effDh;

  for (let i = 1; i < path.length; i++) {
    const ancestorId = path[i]!;
    const ancestorRn = byId.get(ancestorId);
    if (!ancestorRn) break;
    const origin = childAreaOrigin(ancestorRn.node);
    let maxX = 0;
    let maxY = 0;
    for (const childId of childrenOf.get(ancestorId) ?? []) {
      const childRn = byId.get(childId);
      if (!childRn) continue;
      const isPathChild = childId === pathChildId;
      const grow = isPathChild && i === 1;
      const rawX = childRn.x - ancestorRn.x - origin.x + (grow ? effDx : 0);
      const rawY = childRn.y - ancestorRn.y - origin.y + (grow ? effDy : 0);
      const w = isPathChild ? pathChildW : childRn.w;
      const h = isPathChild ? pathChildH : childRn.h;
      maxX = Math.max(maxX, rawX + w);
      maxY = Math.max(maxY, rawY + h);
    }
    const size = shrinkWrapSize(ancestorRn.node, maxX, maxY);
    addDelta(map, ancestorId, { dw: size.w - ancestorRn.w, dh: size.h - ancestorRn.h });
    pathChildId = ancestorId;
    pathChildW = size.w;
    pathChildH = size.h;
  }
}
