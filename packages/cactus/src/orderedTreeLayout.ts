/** Ordered forest, left-aligned children, with contour spacing between cousins.
 * Input order is sibling order. Coordinates are relative to the forest origin.
 */
export function orderedTreeLayout(nodes: readonly { id: string; parentId: string | null }[],
  size: { width: number; height: number }, gap = { x: 24, y: 64 }): Map<string, { x: number; y: number }> {
  const ids = new Set(nodes.map(node => node.id));
  const children = new Map<string | null, string[]>();
  for (const node of nodes) {
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node.id]);
  }
  type Tree = { positions: Map<string, { x: number; y: number }>; left: number[]; right: number[] };
  const visiting = new Set<string>();
  const forest = (siblings: string[]): Tree => {
    const result: Tree = { positions: new Map(), left: [], right: [] };
    for (const id of siblings) {
      if (visiting.has(id)) throw new Error('Layout requires an acyclic tree');
      visiting.add(id);
      const descendants = forest(children.get(id) ?? []);
      visiting.delete(id);
      const tree: Tree = { positions: new Map([[id, { x: 0, y: 0 }]]),
        left: [0, ...descendants.left], right: [size.width, ...descendants.right] };
      for (const [child, point] of descendants.positions) tree.positions.set(child, { x: point.x, y: point.y + size.height + gap.y });
      let shift = 0;
      for (let depth = 0; depth < tree.left.length; depth++) {
        if (result.right[depth] !== undefined) shift = Math.max(shift, result.right[depth]! + gap.x - tree.left[depth]!);
      }
      for (const [child, point] of tree.positions) result.positions.set(child, { x: point.x + shift, y: point.y });
      tree.left.forEach((left, depth) => {
        result.left[depth] = Math.min(result.left[depth] ?? Infinity, left + shift);
        result.right[depth] = Math.max(result.right[depth] ?? -Infinity, tree.right[depth]! + shift);
      });
    }
    return result;
  };
  return forest(children.get(null) ?? []).positions;
}
