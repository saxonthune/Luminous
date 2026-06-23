import type { JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';
import type { ChildLayoutPolicy } from './layout-types.js';

const POLICIES: { policy: ChildLayoutPolicy; glyph: string; label: string }[] = [
  { policy: 'pack', glyph: '▢', label: 'Pack' },
  { policy: 'grid', glyph: '▦', label: 'Grid' },
  { policy: 'stack-v', glyph: '▤', label: 'Stack vertical' },
  { policy: 'stack-h', glyph: '▥', label: 'Stack horizontal' },
];

export interface LayoutPickerProps {
  nodeId: string;
  current: () => ChildLayoutPolicy;
}

export function LayoutPicker(props: LayoutPickerProps): JSX.Element {
  const ctx = useCanvasContext();

  return (
    <div
      data-no-pan="true"
      style={{
        display: 'flex',
        'flex-direction': 'row',
        gap: '1px',
        background: 'var(--cactus-surface, rgba(255,255,255,0.9))',
        border: '1px solid var(--cactus-border-subtle, #e5e7eb)',
        'border-radius': '4px',
        padding: '1px',
        'pointer-events': 'auto',
      }}
    >
      {POLICIES.map(({ policy, glyph, label }) => (
        <button
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={props.current() === policy}
          onClick={(e) => {
            e.stopPropagation();
            ctx.setLayoutOverride(props.nodeId, policy);
          }}
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            width: '18px',
            height: '18px',
            'font-size': '11px',
            border: 'none',
            'border-radius': '3px',
            cursor: 'pointer',
            background: props.current() === policy
              ? 'var(--cactus-accent-subtle, #3b82f6)'
              : 'transparent',
            color: props.current() === policy
              ? '#fff'
              : 'var(--cactus-fg-muted, #6b7280)',
            padding: '0',
            'line-height': '1',
          }}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
