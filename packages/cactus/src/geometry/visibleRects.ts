import type { Transform } from "../interactions/useViewport.js";
import type { Rect } from "./containment.js";

/** Generic viewport culling; the host chooses semantic detail, cactus chooses visibility. */
export function visibleRects<T extends Rect>(
  rects: readonly T[],
  transform: Transform,
  viewport: { width: number; height: number },
  overscan = 200,
): T[] {
  const left = (-transform.x - overscan) / transform.k;
  const top = (-transform.y - overscan) / transform.k;
  const right = (viewport.width - transform.x + overscan) / transform.k;
  const bottom = (viewport.height - transform.y + overscan) / transform.k;
  return rects.filter(
    (r) => r.x <= right && r.x + r.width >= left && r.y <= bottom && r.y + r.height >= top,
  );
}
