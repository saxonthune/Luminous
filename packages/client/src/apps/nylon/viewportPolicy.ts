import type { Transform } from '@luminous/cactus';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RelativeZoomTier = 'overview' | 'working' | 'close';

/** Nylon's zoom-driven behavior lives here so prototype tuning stays local. */
export const NYLON_VIEW_POLICY = {
  standardMinReadableZoom: 0.85,
  contextMinRelativeZoom: 0.18,
  closeRelativeZoom: 0.92,
  secondaryMinScreenWidth: 92,
  secondaryMinScreenHeight: 72,
  minimapWidth: 224,
  minimapHeight: 144,
  minimapPadding: 8,
  ghostWidth: 156,
  ghostHeight: 56,
  ghostInset: 18,
  hudHeight: 38,
} as const;

/** Largest fraction of the viewport occupied by either axis of a Node. */
export function relativeZoom(rect: ViewRect, zoom: number, viewport: ViewportSize): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 0;
  return Math.max(rect.w * zoom / viewport.width, rect.h * zoom / viewport.height);
}

export function relativeZoomTier(value: number): RelativeZoomTier {
  if (value < NYLON_VIEW_POLICY.contextMinRelativeZoom) return 'overview';
  if (value < NYLON_VIEW_POLICY.closeRelativeZoom) return 'working';
  return 'close';
}

export function containerDragLocked(rect: ViewRect, zoom: number, viewport: ViewportSize): boolean {
  return relativeZoomTier(relativeZoom(rect, zoom, viewport)) === 'close';
}

export function showsSecondaryNodeContent(rect: ViewRect, zoom: number): boolean {
  return rect.w * zoom >= NYLON_VIEW_POLICY.secondaryMinScreenWidth
    && rect.h * zoom >= NYLON_VIEW_POLICY.secondaryMinScreenHeight;
}

export function canvasViewport(transform: Transform, viewport: ViewportSize): ViewRect {
  const zoom = Math.max(transform.k, Number.EPSILON);
  return {
    x: -transform.x / zoom,
    y: -transform.y / zoom,
    w: viewport.width / zoom,
    h: viewport.height / zoom,
  };
}

export function rectContainsPoint(rect: ViewRect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w
    && point.y >= rect.y && point.y <= rect.y + rect.h;
}

export function rectIsFullyVisible(rect: ViewRect, viewport: ViewRect): boolean {
  return rect.x >= viewport.x && rect.y >= viewport.y
    && rect.x + rect.w <= viewport.x + viewport.w
    && rect.y + rect.h <= viewport.y + viewport.h;
}
