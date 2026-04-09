export interface TidyNode {
  id: string
  w: number
  h: number
  parentId: string | null
  /**
   * Optional grouping key for root-level layout; ignored for non-root nodes.
   * When `categoryOrder` is set on the options, root nodes are bucketed by
   * this field and arranged in stacked rows.
   */
  category?: string
}

export interface TidyLayoutOptions {
  padding?: number
  headerHeight?: number
  gap?: number
  maxWidth?: number
  rootGap?: number
  /**
   * If set, root nodes are bucketed by their `category` field and arranged in
   * stacked rows in the order given here. Categories not in this list are
   * appended in first-seen order at the end. Categories with zero roots are
   * skipped (no empty row, no gap).
   *
   * If `categoryOrder` is `undefined` AND no root node has a `category` field,
   * the layout falls back to the original single-row behavior.
   * Passing `categoryOrder: []` (empty array) still enables bucketed mode,
   * using only first-seen order for all categories.
   */
  categoryOrder?: string[]
  /**
   * Vertical gap between category rows. Default `120`.
   * Only used when bucketed root layout is active.
   */
  rowGap?: number
  /**
   * If set, only lay out the subtree rooted at this node.
   * The root keeps its existing position — in the result, the root is present
   * with `{x: 0, y: 0, w, h}` as sentinel values. Callers in subtree mode
   * should apply only `w` and `h` to the root, not `x`/`y`.
   */
  rootId?: string
}

export type TidyResult = Map<string, { x: number; y: number; w: number; h: number }>

/**
 * Pure function: given a flat array of nodes with parentId references,
 * compute positions and sizes for all nodes. Containers are sized to fit
 * their children. Leaf nodes keep their original w/h.
 *
 * Input order is preserved — caller pre-sorts if ordering matters.
 *
 * When `options.rootId` is set, only that node's subtree is laid out.
 */
export function tidyLayout(nodes: TidyNode[], options?: TidyLayoutOptions): TidyResult {
  const padding = options?.padding ?? 10;
  const headerHeight = options?.headerHeight ?? 60;
  const gap = options?.gap ?? 20;
  const maxWidth = options?.maxWidth ?? 1400;
  const rootGap = options?.rootGap ?? 60;
  const rowGap = options?.rowGap ?? 120;

  const result: TidyResult = new Map();

  // Build childrenOf map, preserving input order
  const childrenOf = new Map<string | null, string[]>();
  const nodeMap = new Map<string, TidyNode>();

  childrenOf.set(null, []);
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    const p = node.parentId ?? null;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p)!.push(node.id);
  }

  // Mutable sizes — start with node's own w/h, updated as containers get sized
  const sizes = new Map<string, { w: number; h: number }>();
  for (const node of nodes) {
    sizes.set(node.id, { w: node.w, h: node.h });
  }

  // Recursive post-order layout: returns the finalized {w, h} for nodeId
  function layout(nodeId: string): { w: number; h: number } {
    const children = childrenOf.get(nodeId) ?? [];

    if (children.length === 0) {
      // Leaf: keep original size
      const node = nodeMap.get(nodeId)!;
      return { w: node.w, h: node.h };
    }

    // Recursively size all children first
    for (const childId of children) {
      const childSize = layout(childId);
      sizes.set(childId, childSize);
    }

    // Pack children in a wrapping grid, positions relative to parent
    let curX = padding;
    let curY = headerHeight + padding;
    let rowMaxH = 0;
    let rowStartX = padding;
    let maxRowWidth = 0;

    for (const childId of children) {
      const cs = sizes.get(childId)!;

      // Wrap if adding this child would exceed maxWidth (but don't wrap if this is the first item in the row)
      if (curX > padding && curX + cs.w > maxWidth) {
        // Finish current row
        maxRowWidth = Math.max(maxRowWidth, curX - gap);
        curX = padding;
        curY += rowMaxH + gap;
        rowMaxH = 0;
      }

      result.set(childId, { x: curX, y: curY, w: cs.w, h: cs.h });

      curX += cs.w + gap;
      rowMaxH = Math.max(rowMaxH, cs.h);
    }

    // Finish last row
    maxRowWidth = Math.max(maxRowWidth, curX - gap);
    const containerH = curY + rowMaxH + padding;
    const containerW = maxRowWidth + padding;

    return { w: containerW, h: containerH };
  }

  // Subtree mode: lay out just one node's descendants
  if (options?.rootId) {
    if (!nodeMap.has(options.rootId)) return result;
    const { w, h } = layout(options.rootId);
    // x/y are sentinels — caller applies only w/h to the root
    result.set(options.rootId, { x: 0, y: 0, w, h });
    return result;
  }

  // Layout all root nodes
  const rootIds = childrenOf.get(null) ?? [];

  // Pre-compute sizes for all roots (post-order layout)
  const rootSizes = new Map<string, { w: number; h: number }>();
  for (const rootId of rootIds) {
    rootSizes.set(rootId, layout(rootId));
  }

  // Determine whether to use bucketed (category-row) layout or the legacy single-row layout.
  // Bucketed mode activates when `categoryOrder` is explicitly set OR at least one root has a `category` field.
  const hasCategoryInfo =
    options?.categoryOrder !== undefined ||
    rootIds.some((id) => nodeMap.get(id)!.category !== undefined);

  if (!hasCategoryInfo) {
    // Legacy single-row layout — unchanged behavior
    let rootX = 0;
    for (const rootId of rootIds) {
      const { w, h } = rootSizes.get(rootId)!;
      result.set(rootId, { x: rootX, y: 0, w, h });
      rootX += w + rootGap;
    }
  } else {
    // Bucketed layout: group roots by category and stack rows vertically.
    const buckets = new Map<string, string[]>();
    const firstSeen: string[] = [];

    for (const rootId of rootIds) {
      const cat = nodeMap.get(rootId)!.category ?? '__uncategorized__';
      if (!buckets.has(cat)) {
        buckets.set(cat, []);
        firstSeen.push(cat);
      }
      buckets.get(cat)!.push(rootId);
    }

    // Build final row order: start with categoryOrder, then any remaining first-seen categories
    const ordered = options?.categoryOrder ?? [];
    const seen = new Set(ordered);
    const rowOrder = [
      ...ordered.filter((cat) => buckets.has(cat)),
      ...firstSeen.filter((cat) => !seen.has(cat) && buckets.has(cat)),
    ];

    let rowY = 0;
    for (const cat of rowOrder) {
      const bucket = buckets.get(cat);
      if (!bucket || bucket.length === 0) continue;

      let rowX = 0;
      let rowMaxH = 0;
      for (const rootId of bucket) {
        const { w, h } = rootSizes.get(rootId)!;
        result.set(rootId, { x: rowX, y: rowY, w, h });
        rowX += w + rootGap;
        rowMaxH = Math.max(rowMaxH, h);
      }
      rowY += rowMaxH + rowGap;
    }
  }

  return result;
}
