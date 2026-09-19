import { describe, expect, it } from 'vitest';
import { placeAdjacent } from '../src/geometry/placeAdjacent.js';

describe('placeAdjacent', () => {
  it('retains the chosen coordinates when the size argument is a complete rectangle', () => {
    const frame = { x: 0, y: 0, width: 100, height: 100 };
    expect(placeAdjacent(frame, { x: 0, y: 0 }, [frame], 40))
      .toEqual({ x: 0, y: -140, width: 100, height: 100 });
  });
  it('finds clear space in a crowded field and pulls it to an exact buffered boundary', () => {
    const obstacles = Array.from({ length: 25 }, (_, i) => ({
      x: (i % 5) * 110, y: Math.floor(i / 5) * 110, width: 100, height: 100,
    }));
    const result = placeAdjacent({ width: 180, height: 220 }, { x: 210, y: 170 }, obstacles, 30);
    for (const r of obstacles) {
      expect(result.x >= r.x + r.width + 30 || result.x + result.width + 30 <= r.x
        || result.y >= r.y + r.height + 30 || result.y + result.height + 30 <= r.y).toBe(true);
    }
    expect(Math.min(...obstacles.map((r) => Math.hypot(
      Math.max(r.x - result.x - result.width, result.x - r.x - r.width, 0),
      Math.max(r.y - result.y - result.height, result.y - r.y - r.height, 0),
    )))).toBe(30);
  });
  it('uses available holes rather than always placing outside the overall bounds', () => {
    expect(placeAdjacent({ width: 50, height: 50 }, { x: 120, y: 0 }, [
      { x: 0, y: 0, width: 100, height: 100 }, { x: 200, y: 0, width: 100, height: 100 },
    ], 20)).toEqual({ x: 120, y: 0, width: 50, height: 50 });
  });
});
