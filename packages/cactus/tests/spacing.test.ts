import { describe, expect, it } from 'vitest';
import { resolveRectangleOverlaps, spaceRectangles } from '../src/geometry/spacing.ts';

describe('rectangle spacing', () => {
  it('packs a flat set in reading order without overlap', () => {
    const positions = spaceRectangles([
      { id: 'second', x: 10, y: 10, width: 100, height: 80 },
      { id: 'first', x: 0, y: 0, width: 60, height: 40 },
      { id: 'third', x: 0, y: 100, width: 70, height: 30 },
    ], { gap: 20, origin: { x: 12, y: 38 }, columns: 2 });

    expect(positions).toEqual([
      { id: 'first', x: 12, y: 38 },
      { id: 'second', x: 92, y: 38 },
      { id: 'third', x: 12, y: 138 },
    ]);
  });

  it('keeps the source fixed and clears cascading sibling overlaps', () => {
    const positions = resolveRectangleOverlaps([
      { id: 'source', x: 0, y: 0, width: 200, height: 200 },
      { id: 'first', x: 100, y: 100, width: 100, height: 100 },
      { id: 'second', x: 250, y: 250, width: 100, height: 100 },
    ], 'source', 20);

    expect(positions).toEqual([
      { id: 'source', x: 0, y: 0 },
      { id: 'first', x: 220, y: 220 },
      { id: 'second', x: 340, y: 340 },
    ]);
  });
});
