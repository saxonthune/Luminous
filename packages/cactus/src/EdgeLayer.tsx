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

  const revealedPopover = createMemo(() => {
    const id = revealedId();
    if (!id) return null;
    const edge = props.edges.find((e) => e.id === id);
    if (!edge?.labelText) return null;
    const geom = routed().get(edge.id);
    if (!geom) return null;
    return { x: geom.labelX, y: geom.labelY, text: edge.labelText };
  });

  return (
    <>
      <For each={props.edges}>
        {(edge) => {
          const endpoints = createMemo(() => routed().get(edge.id) ?? null);

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
                      x={pts().labelX}
                      y={pts().labelY}
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
