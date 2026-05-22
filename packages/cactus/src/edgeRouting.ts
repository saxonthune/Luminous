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
 * Future passes (TODO): container avoidance, curve routing, self-loops.
 * Add them here so EdgeLayer stays a pure renderer.
 */

import type { EdgeDeclaration } from './types.js';

export interface NodeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
}

const BUNDLE_SPACING = 18;

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
    }

    out.set(e.id, {
      x1,
      y1,
      x2,
      y2,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
    });
  }

  return out;
}
