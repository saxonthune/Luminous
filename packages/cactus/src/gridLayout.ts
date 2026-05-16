import type { LayoutRequest, LayoutResult } from './layout-types.js';

export type { LayoutRequest, LayoutResult };

export interface GridLayoutOptions {
  /** Default size for leaf nodes not in nodeSizes. */
  nodeSize?: { w: number; h: number };
  padding?: number;
  gap?: number;
}

export function gridLayout(req: LayoutRequest, opts?: GridLayoutOptions): LayoutResult {
  const {
    rootIds,
    childrenOf,
    nodeSizes,
    headerHeight = 24,
    headerHeights,
  } = req;

  const nodeSize = opts?.nodeSize ?? { w: 120, h: 60 };
  const padding = opts?.padding ?? 16;
  const gap = opts?.gap ?? 8;

  const headerFor = (id: string) => headerHeights?.get(id) ?? headerHeight;

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

    let curX = padding;
    let curY = headerFor(id) + padding;
    let col = 0;
    let rowH = 0;

    for (const childId of children) {
      const childSize = sizes.get(childId)!;

      if (col > 0 && col % cols === 0) {
        curX = padding;
        curY += rowH + gap;
        rowH = 0;
        col = 0;
      }

      positions.set(childId, { x: curX, y: curY });
      rowH = Math.max(rowH, childSize.h);
      curX += childSize.w + gap;
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
  let rootX = 0;
  for (const rootId of rootIds) {
    positions.set(rootId, { x: rootX, y: 0 });
    const sz = sizes.get(rootId)!;
    rootX += sz.w + gap;
  }

  return { positions, sizes };
}
