import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

interface KvItem {
  key: string;
  value: string;
}

export default function KvList(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const raw = props['items'];
  const items: KvItem[] = Array.isArray(raw)
    ? (raw as unknown[]).map((item) => {
        const r = item as Record<string, unknown>;
        return { key: String(r['key'] ?? ''), value: String(r['value'] ?? '') };
      })
    : [];

  const containerStyle: JSX.CSSProperties = {
    display: 'flex',
    'flex-direction': 'column',
    gap: '2px',
  };

  const rowStyle: JSX.CSSProperties = {
    display: 'flex',
    gap: '8px',
    'align-items': 'baseline',
    'font-size': '12px',
  };

  const keyStyle: JSX.CSSProperties = {
    color: 'var(--cactus-fg-muted, #6b7280)',
    'font-size': '11px',
    'min-width': '60px',
    'flex-shrink': '0',
  };

  const valStyle: JSX.CSSProperties = {
    color: 'var(--cactus-fg, #111827)',
    'font-size': '12px',
  };

  return (
    <div style={containerStyle}>
      {items.map((item) => (
        <div style={rowStyle}>
          <span style={keyStyle}>{item.key}</span>
          <span style={valStyle}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
