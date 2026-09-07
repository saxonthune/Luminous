export interface SpacingRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpaceRectanglesOptions {
  gap: number;
  origin?: { x: number; y: number };
  columns?: number;
}

export interface SpacingPosition {
  id: string;
  x: number;
  y: number;
}

function intersectsWithGap(a: SpacingRect, b: SpacingRect, gap: number): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

/**
 * Pack one flat set of rectangles into deterministic reading-order rows.
 * Rectangle sizes are preserved and no hierarchy below the supplied units is inspected.
 */
export function spaceRectangles(
  rects: readonly SpacingRect[],
  options: SpaceRectanglesOptions,
): SpacingPosition[] {
  if (rects.length === 0) return [];
  const gap = Math.max(0, options.gap);
  const origin = options.origin ?? { x: 0, y: 0 };
  const columns = Math.max(1, Math.floor(options.columns ?? Math.ceil(Math.sqrt(rects.length))));
  const ordered = [...rects].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const positions: SpacingPosition[] = [];
  let y = origin.y;

  for (let start = 0; start < ordered.length; start += columns) {
    const row = ordered.slice(start, start + columns);
    let x = origin.x;
    let rowHeight = 0;
    for (const rect of row) {
      positions.push({ id: rect.id, x, y });
      x += rect.width + gap;
      rowHeight = Math.max(rowHeight, rect.height);
    }
    y += rowHeight + gap;
  }
  return positions;
}

/**
 * Keep one rectangle fixed and move every overlapping peer right and down.
 * Already placed peers become obstacles, so each translation also clears any
 * overlap it would otherwise pass to a later peer.
 */
export function resolveRectangleOverlaps(
  rects: readonly SpacingRect[],
  fixedId: string,
  gap: number,
): SpacingPosition[] {
  const fixed = rects.find((rect) => rect.id === fixedId);
  if (!fixed) return rects.map(({ id, x, y }) => ({ id, x, y }));
  const ordered = [
    fixed,
    ...rects
      .filter((rect) => rect.id !== fixedId)
      .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)),
  ];
  const placed: SpacingRect[] = [];
  const positions: SpacingPosition[] = [];
  const safeGap = Math.max(0, gap);

  for (const original of ordered) {
    const rect = { ...original };
    let obstacle = placed.find((candidate) => intersectsWithGap(rect, candidate, safeGap));
    while (obstacle) {
      rect.x = Math.max(rect.x, obstacle.x + obstacle.width + safeGap);
      rect.y = Math.max(rect.y, obstacle.y + obstacle.height + safeGap);
      obstacle = placed.find((candidate) => intersectsWithGap(rect, candidate, safeGap));
    }
    placed.push(rect);
    positions.push({ id: rect.id, x: rect.x, y: rect.y });
  }
  return positions;
}
