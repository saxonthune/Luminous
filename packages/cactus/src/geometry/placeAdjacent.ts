import type { Rect } from './geometry.js';

/** Find the closest clear rectangle to a preferred position on an unbounded
 * canvas. Obstacle boundaries are the exact contact candidates: unlike a
 * sampled spiral, the result is pulled tight to content with the requested gap.
 * The outermost boundaries always supply a clear candidate. */
export function placeAdjacent(size: Pick<Rect, 'width' | 'height'>, preferred: { x: number; y: number },
  obstacles: readonly Rect[], gap = 32): Rect {
  const xs = new Set([preferred.x]);
  const ys = new Set([preferred.y]);
  for (const rect of obstacles) {
    xs.add(rect.x - gap - size.width);
    xs.add(rect.x + rect.width + gap);
    ys.add(rect.y - gap - size.height);
    ys.add(rect.y + rect.height + gap);
  }
  let best: Rect | undefined;
  let distance = Infinity;
  for (const x of xs) for (const y of ys) {
    const d = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
    if (d >= distance) continue;
    if (obstacles.some((r) => x < r.x + r.width + gap && x + size.width + gap > r.x
      && y < r.y + r.height + gap && y + size.height + gap > r.y)) continue;
    best = { x, y, width: size.width, height: size.height };
    distance = d;
  }
  return best!;
}
