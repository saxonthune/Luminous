import { createMemo, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';
import { useOverflowInspect } from '../useOverflowInspect.ts';

const LEGIBILITY_FLOOR = 7;
const AUTO_CLAMP_LINES = 4;
const BASE_PX: Record<string, number> = { heading: 14, body: 12, caption: 11, mono: 12 };

const styleMap: Record<string, JSX.CSSProperties> = {
  heading: { 'font-size': '14px', 'font-weight': '600' },
  body: { 'font-size': '12px' },
  caption: { 'font-size': '11px', color: 'var(--cactus-fg-subtle, #888)' },
  mono: { 'font-size': '12px', 'font-family': 'monospace' },
};

const toneMap: Record<string, JSX.CSSProperties> = {
  muted: { color: 'var(--cactus-fg-muted, #888)' },
  accent: { color: 'var(--cactus-accent, #3b82f6)' },
  danger: { color: 'var(--cactus-danger, #ef4444)' },
};

export default function Text(
  props: Record<string, unknown>,
  ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const value = String(props['value'] ?? '');
  const color = props['color'];
  const styleName = String(props['style'] ?? 'body');

  const baseStyle: JSX.CSSProperties = {
    ...(styleMap[styleName] ?? styleMap['body']),
    ...(props['tone'] != null ? (toneMap[String(props['tone'])] ?? {}) : {}),
    ...(typeof color === 'string' && color !== '' ? { color } : {}),
  };

  if (styleName === 'heading') {
    const base = BASE_PX['heading']!;
    // Counter-scale: keep heading legible at any zoom (floor 11px, cap 2×base on screen).
    const fontSize = createMemo(() => {
      const k = ctx.zoom();
      const effective = Math.min(base * 2, Math.max(11, base * k));
      return `${effective / k}px`;
    });
    return <span style={{ ...baseStyle, 'font-size': fontSize() }}>{value}</span>;
  }

  // body / caption / mono: geometric sizing, culled below legibility floor.
  const basePx = BASE_PX[styleName] ?? 12;
  const isClampable = styleName === 'body' || styleName === 'caption';

  // Auto-clamp default for body/caption. Pack authors who need different behavior
  // should wrap content in a 'clamp' primitive explicitly.
  if (isClampable && !ctx.expanded?.()) {
    const { overflowed, setRef, onMouseDown, onClick } = useOverflowInspect(ctx);

    return (
      <Show when={basePx * ctx.zoom() >= LEGIBILITY_FLOOR} fallback={null}>
        <div
          ref={setRef}
          style={{
            'max-width': '320px',
            'white-space': 'normal',
            'overflow-wrap': 'break-word',
            display: '-webkit-box',
            '-webkit-box-orient': 'vertical',
            '-webkit-line-clamp': String(AUTO_CLAMP_LINES),
            'line-clamp': String(AUTO_CLAMP_LINES),
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            ...(overflowed() ? { cursor: 'pointer' } : {}),
          }}
          title={overflowed() ? 'Click to expand' : undefined}
          onMouseDown={onMouseDown}
          onClick={onClick}
        >
          <span style={baseStyle}>{value}</span>
        </div>
      </Show>
    );
  }

  return (
    <Show when={basePx * ctx.zoom() >= LEGIBILITY_FLOOR} fallback={null}>
      <span style={{
        ...baseStyle,
        ...(isClampable
          ? { 'max-width': '320px', 'white-space': 'normal', 'overflow-wrap': 'break-word' }
          : {}),
      }}>{value}</span>
    </Show>
  );
}
