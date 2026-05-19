import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import type { EdgeDeclaration } from './types.js';
import { EdgeLabel } from './EdgeLabel.js';

interface EdgeLayerProps {
  edges: EdgeDeclaration[];
  getNodeRects: () => ReadonlyMap<string, { x: number; y: number; w: number; h: number }>;
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

/**
 * Intersect a line from a box's center toward an external point with the
 * box's perimeter. Returns the perimeter point, used to terminate edges
 * at the node border rather than the node center.
 */
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

export function EdgeLayer(props: EdgeLayerProps): JSX.Element {
  const [revealedId, setRevealedId] = createSignal<string | null>(null);

  // Counter-scale label text so on-screen size stays readable across zoom levels.
  const labelFontSize = createMemo(() => {
    const k = props.zoom();
    const effective = Math.min(20, Math.max(11, 10 * k));
    return effective / k;
  });
  const labelHaloWidth = createMemo(() => labelFontSize() * 0.35);

  const revealedPopover = createMemo(() => {
    const id = revealedId();
    if (!id) return null;
    const edge = props.edges.find((e) => e.id === id);
    if (!edge?.labelText) return null;
    const rects = props.getNodeRects();
    const src = rects.get(edge.sourceId);
    const tgt = rects.get(edge.targetId);
    if (!src || !tgt) return null;
    const x = (src.x + src.w / 2 + tgt.x + tgt.w / 2) / 2;
    const y = (src.y + src.h / 2 + tgt.y + tgt.h / 2) / 2;
    return { x, y, text: edge.labelText };
  });

  return (
    <>
      <For each={props.edges}>
        {(edge) => {
          const endpoints = createMemo(() => {
            const rects = props.getNodeRects();
            const src = rects.get(edge.sourceId);
            const tgt = rects.get(edge.targetId);
            if (!src || !tgt) return null;
            const sx = src.x + src.w / 2;
            const sy = src.y + src.h / 2;
            const tx = tgt.x + tgt.w / 2;
            const ty = tgt.y + tgt.h / 2;
            const start = lineExitsBox(sx, sy, src.w, src.h, tx, ty);
            const end = lineExitsBox(tx, ty, tgt.w, tgt.h, sx, sy);
            return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
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
                    <text
                      x={(pts().x1 + pts().x2) / 2}
                      y={(pts().y1 + pts().y2) / 2}
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
