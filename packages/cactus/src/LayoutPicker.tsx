import type { JSX } from 'solid-js';
import { For } from 'solid-js';
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
      <For each={POLICIES}>{(item) => (
        <button
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-pressed={props.current() === item.policy}
          onClick={(e) => {
            e.stopPropagation();
            ctx.setLayoutOverride(props.nodeId, item.policy);
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
            background: props.current() === item.policy
              ? 'var(--cactus-accent-subtle, #3b82f6)'
              : 'transparent',
            color: props.current() === item.policy
              ? '#fff'
              : 'var(--cactus-fg-muted, #6b7280)',
            padding: '0',
            'line-height': '1',
          }}
        >
          {item.glyph}
        </button>
      )}</For>
    </div>
  );
}
