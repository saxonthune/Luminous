import { elkLayout } from './elkLayout.js';
import type { LayoutRequest, LayoutResult } from './layout-types.js';

/** Lay out siblings bottom-up, treating completed child containers as boxes.
 * Cross-boundary edges are lifted to their sibling ancestors at each level.
 * This permits local flow directions without a global hierarchical pass
 * overriding them. Positions are relative to each node's parent. */
export async function compoundLayeredLayout(req: LayoutRequest, options: {
  direction?: 'RIGHT' | 'DOWN';
  containerDirections?: ReadonlyMap<string, 'RIGHT' | 'DOWN'>;
} = {}): Promise<LayoutResult> {
  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map(req.nodeSizes);
  const descendants = new Map<string, Set<string>>();
  const visit = async (ids: readonly string[], parent?: string, inherited = options.direction ?? 'DOWN'): Promise<void> => {
    const direction = (parent && options.containerDirections?.get(parent)) || inherited;
    for (const id of ids) {
      const children = req.childrenOf.get(id) ?? [];
      if (children.length) await visit(children, id, direction);
      descendants.set(id, new Set([id, ...children.flatMap(child => [...descendants.get(child)!])]));
    }
    const owner = new Map<string, string>();
    for (const id of ids) for (const descendant of descendants.get(id)!) owner.set(descendant, id);
    const edges = req.edges.flatMap(edge => {
      const from = owner.get(edge.from), to = owner.get(edge.to);
      return from && to && from !== to ? [{ ...edge, from, to }] : [];
    });
    const result = await elkLayout({ rootIds: ids, childrenOf: new Map(), nodeSizes: sizes, edges }, { direction, spacing: 0.7 });
    const top = parent ? req.headerHeight ?? 48 : 0;
    for (const id of ids) {
      const point = result.positions.get(id)!;
      positions.set(id, { x: point.x + (parent ? 12 : 0), y: point.y + top });
      sizes.set(id, result.sizes.get(id)!);
    }
    if (parent) sizes.set(parent, {
      w: Math.max(sizes.get(parent)?.w ?? 0, ...ids.map(id => positions.get(id)!.x + sizes.get(id)!.w + 24)),
      h: Math.max(...ids.map(id => positions.get(id)!.y + sizes.get(id)!.h + 24)),
    });
  };
  await visit(req.rootIds);
  return { positions, sizes };
}
