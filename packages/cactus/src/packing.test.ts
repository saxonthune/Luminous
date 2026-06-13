import { describe, it, expect } from 'vitest';
import { packRects } from './packing.js';

function noOverlaps(
  rects: ReadonlyArray<{ id: string; w: number; h: number }>,
  positions: Map<string, { x: number; y: number }>,
): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ap = positions.get(a.id)!;
      const bp = positions.get(b.id)!;
      const separated =
        ap.x + a.w <= bp.x || bp.x + b.w <= ap.x ||
        ap.y + a.h <= bp.y || bp.y + b.h <= ap.y;
      if (!separated) return false;
    }
  }
  return true;
}

describe('packRects', () => {
  it('empty input returns zero-height box with minWidth', () => {
    const result = packRects([], { gap: 8, minWidth: 50 });
    expect(result.size).toEqual({ w: 50, h: 0 });
    expect(result.positions.size).toBe(0);
  });

  it('empty input without minWidth returns zero box', () => {
    const result = packRects([], { gap: 8 });
    expect(result.size).toEqual({ w: 0, h: 0 });
  });

  it('single rect is placed at origin with its exact size', () => {
    const rects = [{ id: 'a', w: 40, h: 30 }];
    const result = packRects(rects, { gap: 8 });
    expect(result.positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(result.size).toEqual({ w: 40, h: 30 });
  });

  it('minWidth larger than natural width expands size.w', () => {
    const rects = [{ id: 'a', w: 40, h: 30 }];
    const result = packRects(rects, { gap: 8, minWidth: 100 });
    expect(result.size.w).toBe(100);
    expect(result.size.h).toBe(30);
    expect(result.positions.get('a')).toEqual({ x: 0, y: 0 });
  });

  it('multiple rects have no overlaps and tight bbox', () => {
    const rects = [
      { id: 'a', w: 60, h: 40 },
      { id: 'b', w: 30, h: 70 },
      { id: 'c', w: 50, h: 30 },
      { id: 'd', w: 40, h: 50 },
      { id: 'e', w: 20, h: 60 },
    ];
    const result = packRects(rects, { gap: 8 });

    expect(noOverlaps(rects, result.positions)).toBe(true);

    // Bbox tightly bounds all rects
    let maxRight = 0, maxBottom = 0;
    for (const r of rects) {
      const pos = result.positions.get(r.id)!;
      maxRight = Math.max(maxRight, pos.x + r.w);
      maxBottom = Math.max(maxBottom, pos.y + r.h);
    }
    expect(result.size.w).toBe(maxRight);
    expect(result.size.h).toBe(maxBottom);
  });

  it('all rects are positioned at non-negative coordinates', () => {
    const rects = [
      { id: 'a', w: 80, h: 20 },
      { id: 'b', w: 20, h: 80 },
      { id: 'c', w: 40, h: 40 },
    ];
    const result = packRects(rects, { gap: 4 });
    for (const r of rects) {
      const pos = result.positions.get(r.id)!;
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    }
    expect(noOverlaps(rects, result.positions)).toBe(true);
  });

  it('equal rects are placed without overlaps', () => {
    const rects = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, w: 30, h: 30 }));
    const result = packRects(rects, { gap: 8 });
    expect(noOverlaps(rects, result.positions)).toBe(true);
    expect(result.positions.size).toBe(6);

    // Bbox matches all rects
    let maxRight = 0, maxBottom = 0;
    for (const r of rects) {
      const pos = result.positions.get(r.id)!;
      maxRight = Math.max(maxRight, pos.x + r.w);
      maxBottom = Math.max(maxBottom, pos.y + r.h);
    }
    expect(result.size.w).toBe(maxRight);
    expect(result.size.h).toBe(maxBottom);
  });

  it('adjacent rects never touch (gap is maintained)', () => {
    const rects = [
      { id: 'a', w: 40, h: 40 },
      { id: 'b', w: 40, h: 40 },
    ];
    const gap = 8;
    const result = packRects(rects, { gap });
    const pa = result.positions.get('a')!;
    const pb = result.positions.get('b')!;

    // If placed in the same row, horizontal gap must be >= gap
    if (Math.abs(pa.y - pb.y) < 1) {
      const dist = Math.abs(pa.x - pb.x);
      expect(dist).toBeGreaterThanOrEqual(40); // at least rect width apart
    }
    // If placed in the same column, vertical gap must be >= gap
    if (Math.abs(pa.x - pb.x) < 1) {
      const dist = Math.abs(pa.y - pb.y);
      expect(dist).toBeGreaterThanOrEqual(40);
    }
  });
});
