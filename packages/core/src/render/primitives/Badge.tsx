import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

const toneMap: Record<string, JSX.CSSProperties> = {
  default: { background: '#e5e7eb', color: '#374151' },
  muted: { background: '#f3f4f6', color: '#6b7280' },
  accent: { background: '#dbeafe', color: '#1d4ed8' },
  danger: { background: '#fee2e2', color: '#dc2626' },
};

export default function Badge(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const value = String(props['value'] ?? '');
  const tone = String(props['tone'] ?? 'default');
  const color = props['color'];
  const style: JSX.CSSProperties = {
    display: 'inline-flex',
    'align-items': 'center',
    'font-size': '11px',
    'font-weight': '500',
    'border-radius': '4px',
    padding: '2px 6px',
    'white-space': 'nowrap',
    ...(toneMap[tone] ?? toneMap['default']),
    ...(typeof color === 'string' && color !== '' ? { background: color } : {}),
  };
  return <span style={style}>{value}</span>;
}
