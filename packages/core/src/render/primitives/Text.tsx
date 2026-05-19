import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

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
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const value = String(props['value'] ?? '');
  const color = props['color'];
  const style: JSX.CSSProperties = {
    ...(styleMap[String(props['style'] ?? 'body')] ?? styleMap['body']),
    ...(props['tone'] != null ? (toneMap[String(props['tone'])] ?? {}) : {}),
    ...(typeof color === 'string' && color !== '' ? { color } : {}),
  };
  return <span style={style}>{value}</span>;
}
