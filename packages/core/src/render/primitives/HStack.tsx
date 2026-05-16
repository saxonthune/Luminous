import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

const alignMap: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export default function HStack(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  children: () => JSX.Element,
): JSX.Element {
  const gap = props['gap'] != null ? `${props['gap']}px` : '4px';
  const padding = props['padding'] != null ? `${props['padding']}px` : undefined;
  const align = alignMap[String(props['align'] ?? 'start')] ?? 'flex-start';
  const justify = props['justify'] != null ? String(props['justify']) : undefined;

  const style: JSX.CSSProperties = {
    display: 'flex',
    'flex-direction': 'row',
    gap,
    ...(padding != null ? { padding } : {}),
    'align-items': align,
    ...(justify != null ? { 'justify-content': justify } : {}),
  };

  return <div style={style}>{children()}</div>;
}
