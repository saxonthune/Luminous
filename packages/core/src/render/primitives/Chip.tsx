import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

const toneMap: Record<string, JSX.CSSProperties> = {
  default: { background: 'var(--cactus-surface-alt, #e5e7eb)', color: 'var(--cactus-fg, #374151)' },
  muted: { background: 'var(--cactus-surface-alt, #f3f4f6)', color: 'var(--cactus-fg-muted, #6b7280)' },
  accent: { background: 'var(--cactus-selection, #dbeafe)', color: 'var(--cactus-accent, #1d4ed8)' },
  danger: { background: 'var(--cactus-danger-subtle, #fee2e2)', color: 'var(--cactus-danger, #dc2626)' },
};

export default function Chip(
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
    'border-radius': '9999px',
    padding: '2px 8px',
    'white-space': 'nowrap',
    ...(toneMap[tone] ?? toneMap['default']),
    ...(typeof color === 'string' && color !== '' ? { background: color } : {}),
  };
  return <span style={style}>{value}</span>;
}
