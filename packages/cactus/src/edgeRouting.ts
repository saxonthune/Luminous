/**
 * Edge routing: turns declared edges + node rects into rendered geometry
 * (line endpoints and label anchor). Runs after node layout, before render.
 *
 * Current passes:
 *  - perimeter intersect (terminate at node border, not center)
 *  - bundle fan-out: any N edges between the same unordered node pair are
 *    spread perpendicular to the pair's axis so lines and labels don't stack.
 *    Works for reverse pairs, same-direction parallels, and arbitrary mixes.
 *
 * Hosts may instead supply route geometry. Cactus keeps the direct route as
 * its generic fallback and leaves domain-specific routing outside the engine.
 */

import type { EdgeDeclaration, EdgeRoute, RegisteredNodeRect, RoutePoint } from './types.js';

export type NodeRect = RegisteredNodeRect;

export interface EdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  points: RoutePoint[];
  segmentLayers: number[];
}

const BUNDLE_SPACING = 18;
// Fraction of line length that labels in a bundle spread across, centered on
// the midpoint. 0.4 means the outermost labels sit at t = 0.3 and t = 0.7.
const LABEL_T_SPAN = 0.4;

function lineExitsBox(
  cx: number,
  cy: number,
  w: number,
  h: number,
  toX: number,
  toY: number,
): { x: number; y: number } {
  const dx = toX - cx;
  const dy = toY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = w / 2;
  const halfH = h / 2;
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + t * dx, y: cy + t * dy };
}

function routeLength(points: readonly RoutePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

function midpointAtLength(points: readonly RoutePoint[], distance: number): RoutePoint {
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    if (remaining <= len) {
      const t = remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function toGeometry(route: EdgeRoute, labelT = 0.5): Pick<EdgeGeometry, 'points' | 'segmentLayers' | 'x1' | 'y1' | 'x2' | 'y2' | 'labelX' | 'labelY'> {
  const points = route.points;
  const length = routeLength(points);
  const label = midpointAtLength(points, length * labelT);
  const first = points[0] ?? { x: 0, y: 0 };
  const last = points[points.length - 1] ?? first;
  return {
    x1: first.x, y1: first.y, x2: last.x, y2: last.y,
    labelX: label.x, labelY: label.y,
    points,
    segmentLayers: route.segmentLayers?.length === Math.max(0, points.length - 1)
      ? route.segmentLayers
      : points.slice(1).map(() => 0),
  };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\x00${b}` : `${b}\x00${a}`;
}

export function routeEdges(
  edges: readonly EdgeDeclaration[],
  nodeRects: ReadonlyMap<string, NodeRect>,
): Map<string, EdgeGeometry> {
  // Group edges by unordered pair so reverse and parallel edges fan out together.
  // Self-loops bypass bundling — they need their own routing pass.
  const bundles = new Map<string, EdgeDeclaration[]>();
  for (const e of edges) {
    if (e.sourceId === e.targetId) continue;
    const k = pairKey(e.sourceId, e.targetId);
    let list = bundles.get(k);
    if (!list) {
      list = [];
      bundles.set(k, list);
    }
    list.push(e);
  }
  for (const list of bundles.values()) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const out = new Map<string, EdgeGeometry>();
  for (const e of edges) {
    const src = nodeRects.get(e.sourceId);
    const tgt = nodeRects.get(e.targetId);
    if (!src || !tgt) continue;

    const sx = src.x + src.w / 2;
    const sy = src.y + src.h / 2;
    const tx = tgt.x + tgt.w / 2;
    const ty = tgt.y + tgt.h / 2;
    const start = lineExitsBox(sx, sy, src.w, src.h, tx, ty);
    const end = lineExitsBox(tx, ty, tgt.w, tgt.h, sx, sy);
    let { x: x1, y: y1 } = start;
    let { x: x2, y: y2 } = end;

    let labelT = 0.5;
    const bundle = bundles.get(pairKey(e.sourceId, e.targetId));
    if (bundle && bundle.length > 1) {
      // Fan-out perpendicular to the canonical pair axis (low-id → high-id).
      // Using a canonical axis keeps all bundle siblings parallel regardless
      // of their individual direction.
      const lowId = e.sourceId < e.targetId ? e.sourceId : e.targetId;
      const highId = e.sourceId < e.targetId ? e.targetId : e.sourceId;
      const low = nodeRects.get(lowId)!;
      const high = nodeRects.get(highId)!;
      const ax = high.x + high.w / 2 - (low.x + low.w / 2);
      const ay = high.y + high.h / 2 - (low.y + low.h / 2);
      const len = Math.hypot(ax, ay) || 1;
      const nx = -ay / len;
      const ny = ax / len;

      const index = bundle.indexOf(e);
      const center = (bundle.length - 1) / 2;
      const offset = (index - center) * BUNDLE_SPACING;
      const ox = nx * offset;
      const oy = ny * offset;
      x1 += ox;
      y1 += oy;
      x2 += ox;
      y2 += oy;

      // Stagger labels along their own line so wide labels on near-parallel
      // bundles don't horizontally collide. Spread t across LABEL_T_SPAN
      // centered at 0.5, deterministic by bundle index.
      if (bundle.length > 1) {
        labelT = 0.5 + (LABEL_T_SPAN * (index - center)) / Math.max(1, bundle.length - 1);
      }
    }

    const custom = e.routeBuilder?.(nodeRects);
    if (custom && custom.points.length >= 2) {
      out.set(e.id, { ...toGeometry(custom), segmentLayers: custom.segmentLayers ?? custom.points.slice(1).map(() => 0) });
    } else {
      out.set(e.id, toGeometry({ points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], segmentLayers: [0] }, labelT));
    }
  }

  return out;
}
