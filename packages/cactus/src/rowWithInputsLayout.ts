/** A horizontal spine with input cards stacked above their target column. */
export function rowWithInputsLayout(
  columns: readonly { id: string; inputs: readonly string[] }[],
  sizes: ReadonlyMap<string, { w: number; h: number }>,
  direction: 'RIGHT' | 'DOWN' = 'RIGHT',
): Map<string, { x: number; y: number }> {
  const gap = 48;
  if (direction === 'DOWN') {
    const positions = new Map<string, { x: number; y: number }>();
    const inputWidth = Math.max(0, ...columns.flatMap(column => column.inputs.map(id => sizes.get(id)!.w)));
    const spineWidth = Math.max(0, ...columns.map(column => sizes.get(column.id)!.w));
    const spineX = inputWidth ? inputWidth + gap : 0;
    let y = 0;
    for (const column of columns) {
      for (const id of column.inputs) {
        const size = sizes.get(id)!;
        positions.set(id, { x: inputWidth - size.w, y });
        y += size.h + gap;
      }
      const size = sizes.get(column.id)!;
      positions.set(column.id, { x: spineX + (spineWidth - size.w) / 2, y });
      y += size.h + gap;
    }
    return positions;
  }
  const stackHeight = (ids: readonly string[]) => ids.reduce((height, id) => height + sizes.get(id)!.h + gap, 0);
  const baseline = Math.max(0, ...columns.map(column => stackHeight(column.inputs)));
  const positions = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const column of columns) {
    const width = Math.max(...[column.id, ...column.inputs].map(id => sizes.get(id)!.w));
    positions.set(column.id, { x: x + (width - sizes.get(column.id)!.w) / 2, y: baseline });
    let y = baseline - stackHeight(column.inputs);
    for (const id of column.inputs) {
      const size = sizes.get(id)!;
      positions.set(id, { x: x + (width - size.w) / 2, y });
      y += size.h + gap;
    }
    x += width + gap;
  }
  return positions;
}
