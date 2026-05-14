import { createMemo, For, Show, type JSX } from 'solid-js';
import type { EdgeDeclaration } from './types.js';

interface EdgeLayerProps {
  edges: EdgeDeclaration[];
  getNodeRects: () => ReadonlyMap<string, { x: number; y: number; w: number; h: number }>;
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
  return (
    <For each={props.edges}>
      {(edge) => {
        const endpoints = createMemo(() => {
          const rects = props.getNodeRects();
          const src = rects.get(edge.sourceId);
          const tgt = rects.get(edge.targetId);
          if (!src || !tgt) return null;
          return {
            x1: src.x + src.w / 2,
            y1: src.y + src.h / 2,
            x2: tgt.x + tgt.w / 2,
            y2: tgt.y + tgt.h / 2,
          };
        });

        const dash = edge.styling?.dash;
        const strokeDasharray =
          dash === 'dashed' ? '6 3' : dash === 'dotted' ? '2 3' : undefined;
        const color = edge.styling?.colorToken
          ? `var(--${edge.styling.colorToken})`
          : 'var(--fg-muted, #888)';
        const width = edge.styling?.width ?? 1.5;
        const arrowHead = edge.styling?.arrowHead ?? false;

        // TODO(routing): straight-line routing only. Curve/avoid-containers routing is a follow-up.
        return (
          <Show when={endpoints()}>
            {(pts) => (
              <>
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
                <Show when={edge.label}>
                  <text
                    x={(pts().x1 + pts().x2) / 2}
                    y={(pts().y1 + pts().y2) / 2}
                    text-anchor="middle"
                    dominant-baseline="middle"
                    font-size="10"
                    fill={color}
                    style={{ 'pointer-events': 'none' }}
                  >
                    {edge.label?.()}
                  </text>
                </Show>
              </>
            )}
          </Show>
        );
      }}
    </For>
  );
}
