export interface PackRect { id: string; w: number; h: number; }
export interface PackOptions { gap: number; minWidth?: number; }
export interface PackResult {
  positions: Map<string, { x: number; y: number }>;
  size: { w: number; h: number };
}

type Sky = { x: number; y: number }[];

function getHeightAt(sky: Sky, qx: number): number {
  let y = 0;
  for (const seg of sky) {
    if (seg.x <= qx) y = seg.y;
    else break;
  }
  return y;
}

function queryMaxHeight(sky: Sky, qx: number, qEnd: number): number {
  let maxY = 0;
  for (let i = 0; i < sky.length; i++) {
    const segStart = sky[i].x;
    const segEnd = i + 1 < sky.length ? sky[i + 1].x : Infinity;
    if (segStart >= qEnd) break;
    if (segEnd > qx) maxY = Math.max(maxY, sky[i].y);
  }
  return maxY;
}

function updateSky(sky: Sky, px: number, pEnd: number, newY: number): Sky {
  const tailY = getHeightAt(sky, pEnd);
  const result: Sky = [];
  for (const seg of sky) {
    if (seg.x < px) result.push(seg);
  }
  result.push({ x: px, y: newY });
  if (tailY !== newY) result.push({ x: pEnd, y: tailY });
  for (const seg of sky) {
    if (seg.x > pEnd) result.push(seg);
  }
  return result.filter((seg, i) => i === 0 || seg.y !== result[i - 1].y);
}

function tryPack(
  sorted: PackRect[],
  targetWidth: number,
  gap: number,
): { positions: Map<string, { x: number; y: number }>; bboxW: number; bboxH: number } | null {
  let sky: Sky = [{ x: 0, y: 0 }];
  const positions = new Map<string, { x: number; y: number }>();

  for (const rect of sorted) {
    if (rect.w > targetWidth) return null;
    const rw = rect.w + gap;
    const rh = rect.h + gap;
    const maxStartX = targetWidth - rect.w;

    let bestX = 0;
    let bestY = Infinity;

    for (const seg of sky) {
      const x = seg.x;
      if (x > maxStartX) break;
      const maxY = queryMaxHeight(sky, x, x + rw);
      if (maxY < bestY || (maxY === bestY && x < bestX)) {
        bestY = maxY;
        bestX = x;
      }
    }

    positions.set(rect.id, { x: bestX, y: bestY });
    sky = updateSky(sky, bestX, bestX + rw, bestY + rh);
  }

  let bboxW = 0;
  let bboxH = 0;
  for (const rect of sorted) {
    const pos = positions.get(rect.id)!;
    bboxW = Math.max(bboxW, pos.x + rect.w);
    bboxH = Math.max(bboxH, pos.y + rect.h);
  }

  return { positions, bboxW, bboxH };
}

export function packRects(rects: ReadonlyArray<PackRect>, opts: PackOptions): PackResult {
  const { gap, minWidth = 0 } = opts;

  if (rects.length === 0) {
    return { positions: new Map(), size: { w: minWidth, h: 0 } };
  }

  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w);
  const maxW = sorted.reduce((m, r) => Math.max(m, r.w), 0);

  const candidateSet = new Set<number>();
  let cumW = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumW += sorted[i].w;
    candidateSet.add(Math.max(maxW, cumW + gap * i));
  }
  candidateSet.add(Math.max(maxW, minWidth));

  let bestPositions: Map<string, { x: number; y: number }> | null = null;
  let bestScore = Infinity;
  let bestSize: { w: number; h: number } = { w: 0, h: 0 };

  for (const targetWidth of candidateSet) {
    const result = tryPack(sorted, targetWidth, gap);
    if (!result) continue;
    const finalW = Math.max(result.bboxW, minWidth);
    const score = finalW * result.bboxH;
    const squareness = Math.abs(finalW - result.bboxH);
    const bestSquareness = Math.abs(bestSize.w - bestSize.h);
    if (score < bestScore || (score === bestScore && squareness < bestSquareness)) {
      bestScore = score;
      bestPositions = result.positions;
      bestSize = { w: finalW, h: result.bboxH };
    }
  }

  return {
    positions: bestPositions ?? new Map(),
    size: bestSize,
  };
}
