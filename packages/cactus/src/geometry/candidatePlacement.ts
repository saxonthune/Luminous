export interface CandidatePlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CandidatePlacementPoint {
  x: number;
  y: number;
}

export interface CandidatePlacementOptions {
  gap?: number;
  /** Hard bounds. A fitting rectangle is clamped fully inside them. */
  bounds?: CandidatePlacementRect;
  /** Soft containment constraint scored after hard-bounds overflow and before
   * obstacle overlap. */
  containment?: {
    bounds: CandidatePlacementRect;
    minFraction: number;
  };
}

export interface CandidatePlacementResult extends CandidatePlacementRect {
  candidateIndex: number;
  overlapArea: number;
  overflowArea: number;
  containmentFraction: number;
  containmentDeficit: number;
}

function intersectionArea(a: CandidatePlacementRect, b: CandidatePlacementRect): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function rectAtCenter(
  center: CandidatePlacementPoint,
  size: { width: number; height: number },
  bounds?: CandidatePlacementRect,
): CandidatePlacementRect {
  let x = center.x - size.width / 2;
  let y = center.y - size.height / 2;
  if (bounds) {
    x = size.width <= bounds.width
      ? Math.min(Math.max(x, bounds.x), bounds.x + bounds.width - size.width)
      : bounds.x + (bounds.width - size.width) / 2;
    y = size.height <= bounds.height
      ? Math.min(Math.max(y, bounds.y), bounds.y + bounds.height - size.height)
      : bounds.y + (bounds.height - size.height) / 2;
  }
  return { x, y, ...size };
}

/**
 * Place one rectangle at the best caller-supplied candidate center. Bounds
 * are preferred before obstacle clearance; candidate order breaks ties.
 * Cactus assigns no meaning to the placed item or the obstacles.
 */
export function placeRectAtCandidates(
  size: { width: number; height: number },
  candidates: readonly CandidatePlacementPoint[],
  obstacles: readonly CandidatePlacementRect[],
  options: CandidatePlacementOptions = {},
): CandidatePlacementResult {
  const gap = options.gap ?? 0;
  const centers = candidates.length > 0 ? candidates : [{ x: 0, y: 0 }];
  let best: CandidatePlacementResult | undefined;

  for (let index = 0; index < centers.length; index += 1) {
    const rect = rectAtCenter(centers[index], size, options.bounds);
    const overlapArea = obstacles.reduce((total, obstacle) => total + intersectionArea(rect, {
      x: obstacle.x - gap,
      y: obstacle.y - gap,
      width: obstacle.width + gap * 2,
      height: obstacle.height + gap * 2,
    }), 0);
    const insideArea = options.bounds ? intersectionArea(rect, options.bounds) : rect.width * rect.height;
    const containedArea = options.containment
      ? intersectionArea(rect, options.containment.bounds)
      : rect.width * rect.height;
    const containmentFraction = containedArea / Math.max(1, rect.width * rect.height);
    const containmentDeficit = options.containment
      ? Math.max(0, Math.min(1, options.containment.minFraction) - containmentFraction)
      : 0;
    const candidate: CandidatePlacementResult = {
      ...rect,
      candidateIndex: index,
      overlapArea,
      overflowArea: rect.width * rect.height - insideArea,
      containmentFraction,
      containmentDeficit,
    };
    if (!best
      || candidate.overflowArea < best.overflowArea
      || (candidate.overflowArea === best.overflowArea
        && candidate.containmentDeficit < best.containmentDeficit)
      || (candidate.overflowArea === best.overflowArea
        && candidate.containmentDeficit === best.containmentDeficit
        && candidate.overlapArea < best.overlapArea)
      || (candidate.overflowArea === best.overflowArea
        && candidate.containmentDeficit === best.containmentDeficit
        && candidate.overlapArea === best.overlapArea
        && candidate.candidateIndex < best.candidateIndex)) {
      best = candidate;
    }
  }

  return best!;
}
