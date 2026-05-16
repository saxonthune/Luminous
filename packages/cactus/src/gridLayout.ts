import type { LayoutRequest, LayoutResult } from './layout-types.js';

export type { LayoutRequest, LayoutResult };

export interface GridLayoutOptions {
  /** Default size for leaf nodes not in nodeSizes. */
  nodeSize?: { w: number; h: number };
  padding?: number;
  gap?: number;
}

/** Sentinel parent key for top-level (root) nodes, which have no real parent. */
const ROOT_KEY = '__roots__';

export function gridLayout(req: LayoutRequest, opts?: GridLayoutOptions): LayoutResult {
  const {
    rootIds,
    childrenOf,
    nodeSizes,
    headerHeight = 24,
    headerHeights,
    edges,
  } = req;

  const nodeSize = opts?.nodeSize ?? { w: 120, h: 60 };
  const padding = opts?.padding ?? 16;
  const baseGap = opts?.gap ?? 8;

  const headerFor = (id: string) => headerHeights?.get(id) ?? headerHeight;

  // Map each node to its parent (ROOT_KEY for top-level nodes) so edge labels
  // can be attributed to the grid that lays out both endpoints.
  const parentOf = new Map<string, string>();
  for (const [parent, kids] of childrenOf) {
    for (const kid of kids) parentOf.set(kid, parent);
  }
  for (const rid of rootIds) {
    if (!parentOf.has(rid)) parentOf.set(rid, ROOT_KEY);
  }

  // Per-parent extra spacing needed so a labeled edge between two of its
  // children fits in the gap rather than overlapping a node.
  const labelGap = new Map<string, { x: number; y: number }>();
  for (const e of edges) {
    if (!e.label) continue;
    const parent = parentOf.get(e.from);
    if (parent === undefined || parentOf.get(e.to) !== parent) continue;
    const cur = labelGap.get(parent) ?? { x: 0, y: 0 };
    cur.x = Math.max(cur.x, e.label.w);
    cur.y = Math.max(cur.y, e.label.h);
    labelGap.set(parent, cur);
  }
  const gapsFor = (parent: string): { x: number; y: number } => {
    const lg = labelGap.get(parent);
    return lg
      ? { x: Math.max(baseGap, lg.x + 4), y: Math.max(baseGap, lg.y + 4) }
      : { x: baseGap, y: baseGap };
  };

  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { w: number; h: number }>();

  function layoutNode(id: string): void {
    const children = childrenOf.get(id) ?? [];

    if (children.length === 0) {
      const size = nodeSizes?.get(id) ?? nodeSize;
      sizes.set(id, { w: size.w, h: size.h });
      return;
    }

    // Post-order: layout all children first
    for (const childId of children) {
      layoutNode(childId);
    }

    const cols = Math.ceil(Math.sqrt(children.length));
    const { x: gapX, y: gapY } = gapsFor(id);

    let curX = padding;
    let curY = headerFor(id) + padding;
    let col = 0;
    let rowH = 0;

    for (const childId of children) {
      const childSize = sizes.get(childId)!;

      if (col > 0 && col % cols === 0) {
        curX = padding;
        curY += rowH + gapY;
        rowH = 0;
        col = 0;
      }

      positions.set(childId, { x: curX, y: curY });
      rowH = Math.max(rowH, childSize.h);
      curX += childSize.w + gapX;
      col++;
    }

    // Bounding box of placed children
    let maxRight = 0;
    let maxBottom = 0;
    for (const childId of children) {
      const pos = positions.get(childId)!;
      const sz = sizes.get(childId)!;
      maxRight = Math.max(maxRight, pos.x + sz.w);
      maxBottom = Math.max(maxBottom, pos.y + sz.h);
    }

    sizes.set(id, { w: maxRight + padding, h: maxBottom + padding });
  }

  for (const rootId of rootIds) {
    layoutNode(rootId);
  }

  // Place roots in a single top-level row, left-to-right
  const rootGapX = gapsFor(ROOT_KEY).x;
  let rootX = 0;
  for (const rootId of rootIds) {
    positions.set(rootId, { x: rootX, y: 0 });
    const sz = sizes.get(rootId)!;
    rootX += sz.w + rootGapX;
  }

  return { positions, sizes };
}
