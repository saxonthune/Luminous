export interface ExpansionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpansionUnit extends ExpansionRect {
  id: string;
}

export interface ExpansionTranslation {
  id: string;
  dx: number;
  dy: number;
}

function intersectsWithGap(a: ExpansionRect, b: ExpansionRect, gap: number): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

/**
 * Calculate sibling translations after one unit grows from `sourceBefore` to
 * its current size. Units that began beyond the source's right or bottom edge
 * move past the corresponding grown edge. Their movement can push later units.
 */
export function computeExpansionTranslations(
  units: readonly ExpansionUnit[],
  sourceId: string,
  sourceBefore: ExpansionRect,
  gap: number,
): ExpansionTranslation[] {
  const current = new Map(units.map((unit) => [unit.id, { ...unit }]));
  const source = current.get(sourceId);
  if (!source) return [];

  const bases = new Map(units.map((unit) => [unit.id, { ...unit }]));
  bases.set(sourceId, { id: sourceId, ...sourceBefore });
  const totals = new Map<string, { dx: number; dy: number }>();
  const queue = [sourceId];
  const queued = new Set(queue);
  const maxPasses = Math.max(1, units.length * units.length * 4);
  let passes = 0;

  while (queue.length > 0 && passes < maxPasses) {
    passes += 1;
    const obstacleId = queue.shift();
    if (obstacleId === undefined) break;
    queued.delete(obstacleId);
    const obstacle = current.get(obstacleId);
    const obstacleBase = bases.get(obstacleId);
    if (!obstacle || !obstacleBase) continue;

    for (const target of current.values()) {
      if (target.id === obstacleId || target.id === sourceId || !intersectsWithGap(obstacle, target, gap)) continue;
      const targetBase = bases.get(target.id);
      if (!targetBase) continue;
      const isRight = targetBase.x >= obstacleBase.x + obstacleBase.width;
      const isBelow = targetBase.y >= obstacleBase.y + obstacleBase.height;
      if (!isRight && !isBelow) continue;

      const dx = isRight ? Math.max(0, obstacle.x + obstacle.width + gap - target.x) : 0;
      const dy = isBelow ? Math.max(0, obstacle.y + obstacle.height + gap - target.y) : 0;
      if (dx === 0 && dy === 0) continue;

      target.x += dx;
      target.y += dy;
      const total = totals.get(target.id) ?? { dx: 0, dy: 0 };
      total.dx += dx;
      total.dy += dy;
      totals.set(target.id, total);
      if (!queued.has(target.id)) {
        queue.push(target.id);
        queued.add(target.id);
      }
    }
  }

  return units.flatMap((unit) => {
    const delta = totals.get(unit.id);
    return delta ? [{ id: unit.id, ...delta }] : [];
  });
}
