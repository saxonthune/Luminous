import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import type { EdgeDeclaration } from './types.js';
import { EdgeLabel } from './EdgeLabel.js';
import { routeEdges, type NodeRect } from './edgeRouting.js';

interface EdgeLayerProps {
  edges: EdgeDeclaration[];
  getNodeRects: () => ReadonlyMap<string, NodeRect>;
  layer: 'lines' | 'labels';
  zoom: () => number;
}

const LABEL_CAP = 28;

function truncate(s: string): string {
  return s.length > LABEL_CAP ? s.slice(0, LABEL_CAP) + '…' : s;
}

function arrowHeadPath(x1: number, y1: number, x2: number, y2: number, size = 8): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const baseX1 = x2 - size * Math.cos(angle - Math.PI / 6);
  const baseY1 = y2 - size * Math.sin(angle - Math.PI / 6);
  const baseX2 = x2 - size * Math.cos(angle + Math.PI / 6);
  const baseY2 = y2 - size * Math.sin(angle + Math.PI / 6);
  return `M ${x2} ${y2} L ${baseX1} ${baseY1} L ${baseX2} ${baseY2} Z`;
}

// Slide label along its edge to dodge unrelated nodes. Candidates are offsets
// from the route-chosen anchor (which already accounts for bundle stagger),
// measured as a fraction of the line length. First overlap-free candidate
// wins; otherwise the candidate with the fewest overlaps. Endpoints are
// excluded from the overlap test — the label is supposed to sit near them.
interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function chooseLabelAnchor(
  pts: { x1: number; y1: number; x2: number; y2: number; labelX: number; labelY: number },
  box: { w: number; h: number },
  sourceId: string,
  targetId: string,
  rects: ReadonlyMap<string, NodeRect>,
  placedLabels: readonly LabelRect[],
): { x: number; y: number } {
  const len = Math.hypot(pts.x2 - pts.x1, pts.y2 - pts.y1);
  if (len === 0) return { x: pts.labelX, y: pts.labelY };
  const ux = (pts.x2 - pts.x1) / len;
  const uy = (pts.y2 - pts.y1) / len;
  const offsets = [0, -0.15, 0.15, -0.3, 0.3, -0.4, 0.4];

  let bestOverlap = Infinity;
  let best = { x: pts.labelX, y: pts.labelY };
  for (const t of offsets) {
    const cx = pts.labelX + ux * len * t;
    const cy = pts.labelY + uy * len * t;
    const lx = cx - box.w / 2;
    const ly = cy - box.h / 2;
    let n = 0;
    for (const [id, r] of rects) {
      if (id === sourceId || id === targetId) continue;
      if (lx < r.x + r.w && lx + box.w > r.x && ly < r.y + r.h && ly + box.h > r.y) n++;
    }
    for (const p of placedLabels) {
      if (lx < p.x + p.w && lx + box.w > p.x && ly < p.y + p.h && ly + box.h > p.y) n++;
    }
    if (n === 0) return { x: cx, y: cy };
    if (n < bestOverlap) {
      bestOverlap = n;
      best = { x: cx, y: cy };
    }
  }
  return best;
}

export function EdgeLayer(props: EdgeLayerProps): JSX.Element {
  const [revealedId, setRevealedId] = createSignal<string | null>(null);

  // Counter-scale label text so on-screen size stays readable across zoom levels.
  const labelFontSize = createMemo(() => {
    const k = props.zoom();
    const effective = Math.min(20, Math.max(11, 10 * k));
    return effective / k;
  });
  const labelHaloWidth = createMemo(() => labelFontSize() * 0.35);

  const routed = createMemo(() => routeEdges(props.edges, props.getNodeRects()));

  // Label anchors: for edges with text, slide along the line to dodge unrelated
  // nodes. Outer memo so per-edge rendering and the revealed-popover see the
  // same chosen position.
  const labelAnchors = createMemo(() => {
    const rects = props.getNodeRects();
    const r = routed();
    const fs = labelFontSize();
    const map = new Map<string, { x: number; y: number }>();
    const placed: LabelRect[] = [];
    for (const edge of props.edges) {
      const pts = r.get(edge.id);
      if (!pts) continue;
      if (!edge.labelText) {
        map.set(edge.id, { x: pts.labelX, y: pts.labelY });
        continue;
      }
      const text = truncate(edge.labelText);
      const box = { w: text.length * fs * 0.56 + 10, h: fs * 1.4 };
      const anchor = chooseLabelAnchor(pts, box, edge.sourceId, edge.targetId, rects, placed);
      map.set(edge.id, anchor);
      placed.push({ x: anchor.x - box.w / 2, y: anchor.y - box.h / 2, w: box.w, h: box.h });
    }
    return map;
  });

  const revealedPopover = createMemo(() => {
    const id = revealedId();
    if (!id) return null;
    const edge = props.edges.find((e) => e.id === id);
    if (!edge?.labelText) return null;
    const anchor = labelAnchors().get(edge.id);
    if (!anchor) return null;
    return { x: anchor.x, y: anchor.y, text: edge.labelText };
  });

  return (
    <>
      <For each={props.edges}>
        {(edge) => {
          const endpoints = createMemo(() => routed().get(edge.id) ?? null);

          // Estimated label box (text width + padding). Matches the ~5.6px per
          // glyph used by estimateEdgeLabelSize in PgCanvasView so the rendered
          // background stays in sync with the layout's reserved space.
          const labelBox = createMemo(() => {
            if (!edge.labelText) return null;
            const text = truncate(edge.labelText);
            const fs = labelFontSize();
            return {
              w: text.length * fs * 0.56 + 10,
              h: fs * 1.4,
            };
          });

          const dash = edge.styling?.dash;
          const strokeDasharray =
            dash === 'dashed' ? '6 3' : dash === 'dotted' ? '2 3' : undefined;
          const color = edge.styling?.colorToken
            ? `var(--${edge.styling.colorToken})`
            : 'var(--cactus-fg-muted, #6b7280)';
          const width = edge.styling?.width ?? 1.5;
          const arrowHead = edge.styling?.arrowHead ?? false;

          // TODO(routing): straight-line routing only. Curve/avoid-containers routing is a follow-up.
          return (
            <Show when={endpoints()}>
              {(pts) => (
                <>
                  <Show when={props.layer === 'lines'}>
                    <line
                      x1={pts().x1}
                      y1={pts().y1}
                      x2={pts().x2}
                      y2={pts().y2}
                      stroke={color}
                      stroke-width={width}
                      stroke-dasharray={strokeDasharray}
                      stroke-linecap="round"
                    />
                    <Show when={arrowHead}>
                      <path d={arrowHeadPath(pts().x1, pts().y1, pts().x2, pts().y2)} fill={color} />
                    </Show>
                  </Show>
                  <Show when={props.layer === 'labels' && !!(edge.labelText || edge.label)}>
                    <Show when={labelBox()}>
                      {(box) => (
                        <rect
                          x={(labelAnchors().get(edge.id)?.x ?? pts().labelX) - box().w / 2}
                          y={(labelAnchors().get(edge.id)?.y ?? pts().labelY) - box().h / 2}
                          width={box().w}
                          height={box().h}
                          rx={3}
                          fill="var(--cactus-canvas-bg, #ffffff)"
                          style={{ 'pointer-events': 'none' }}
                        />
                      )}
                    </Show>
                    <text
                      x={labelAnchors().get(edge.id)?.x ?? pts().labelX}
                      y={labelAnchors().get(edge.id)?.y ?? pts().labelY}
                      text-anchor="middle"
                      dominant-baseline="middle"
                      font-size={`${labelFontSize()}`}
                      fill={color}
                      stroke="var(--cactus-canvas-bg, #ffffff)"
                      stroke-width={labelHaloWidth()}
                      stroke-linejoin="round"
                      paint-order="stroke fill"
                      style={{
                        'pointer-events': edge.labelText ? 'auto' : 'none',
                        cursor: edge.labelText ? 'pointer' : undefined,
                      }}
                      onClick={
                        edge.labelText
                          ? () => setRevealedId((id) => (id === edge.id ? null : edge.id))
                          : undefined
                      }
                    >
                      {edge.labelText ? truncate(edge.labelText) : edge.label?.()}
                    </text>
                  </Show>
                </>
              )}
            </Show>
          );
        }}
      </For>
      <Show when={props.layer === 'labels'}>
        <Show when={revealedPopover()}>
          {(mp) => (
            <EdgeLabel x={mp().x} y={mp().y} onClick={() => setRevealedId(null)}>
              <span style={{ 'font-size': '10px', color: 'var(--cactus-fg, #111827)' }}>{mp().text}</span>
            </EdgeLabel>
          )}
        </Show>
      </Show>
    </>
  );
}
