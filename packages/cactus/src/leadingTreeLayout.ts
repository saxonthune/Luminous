/** LR ordered tree: first child shares its parent's top; later subtrees stack below. */
export function leadingTreeLayout(
  roots: readonly string[], children: ReadonlyMap<string, readonly string[]>,
  sizes: ReadonlyMap<string, { w: number; h: number }>, gap = { x: 40, y: 16 },
): Map<string, { x: number; y: number }> {
  const widths: number[] = [], heights = new Map<string, number>(), seen = new Set<string>();
  function measure(id: string, depth: number): number {
    if (seen.has(id)) throw new Error(`Tree layout requires unique acyclic parentage: ${id}`);
    seen.add(id);
    const size = sizes.get(id);
    if (!size || !Number.isFinite(size.w) || !Number.isFinite(size.h) || size.w <= 0 || size.h <= 0) throw new Error(`Invalid tree node size: ${id}`);
    widths[depth] = Math.max(widths[depth] ?? 0, size.w);
    const childIds = children.get(id) ?? [];
    const height = Math.max(size.h, childIds.reduce((total, child, i) => total + measure(child, depth + 1) + (i ? gap.y : 0), 0));
    heights.set(id, height);
    return height;
  }
  roots.forEach(root => measure(root, 0));
  if (seen.size !== sizes.size) throw new Error('Tree layout has unreachable nodes');
  let nextX = 0;
  const columns = widths.map(width => { const x = nextX; nextX += width + gap.x; return x; });
  const positions = new Map<string, { x: number; y: number }>();
  function place(id: string, depth: number, y: number) {
    positions.set(id, { x: columns[depth], y });
    let nextY = y;
    for (const child of children.get(id) ?? []) {
      place(child, depth + 1, nextY);
      nextY += heights.get(child)! + gap.y;
    }
  }
  let nextY = 0;
  for (const root of roots) { place(root, 0, nextY); nextY += heights.get(root)! + gap.y; }
  return positions;
}

/** Linear visible-subtree demand calculation; collapsed branches consume only their own height. */
export function visibleTreeLayout(
  roots: readonly string[], children: ReadonlyMap<string, readonly string[]>,
  sizes: ReadonlyMap<string, { w: number; h: number }>, collapsed: ReadonlySet<string>,
  gap = { x: 40, y: 16 },
): Map<string, { x: number; y: number }> {
  const visibleChildren = new Map<string, readonly string[]>();
  const visibleSizes = new Map<string, { w: number; h: number }>();
  function visit(id: string) {
    if (visibleSizes.has(id)) throw new Error(`Tree layout requires unique acyclic parentage: ${id}`);
    const size = sizes.get(id);
    if (!size) throw new Error(`Missing tree node size: ${id}`);
    visibleSizes.set(id, size);
    const childIds = collapsed.has(id) ? [] : children.get(id) ?? [];
    visibleChildren.set(id, childIds);
    childIds.forEach(visit);
  }
  roots.forEach(visit);
  return leadingTreeLayout(roots, visibleChildren, visibleSizes, gap);
}
