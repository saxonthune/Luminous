import { onMount, onCleanup, For, Show } from 'solid-js';

export interface MenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu(props: ContextMenuProps) {
  let menuRef: HTMLDivElement | undefined;

  onMount(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('mousedown', handleClickOutside, true);
    onCleanup(() => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('mousedown', handleClickOutside, true);
    });
  });

  const menuWidth = 160;
  const menuItemHeight = 28;
  const separatorHeight = 9;
  const padding = 8;
  const itemCount = () => props.items.filter((i) => !i.separator).length;
  const sepCount = () => props.items.filter((i) => i.separator).length;
  const estimatedHeight = () => itemCount() * menuItemHeight + sepCount() * separatorHeight + padding * 2;

  const adjustedX = () => props.x + menuWidth > window.innerWidth ? props.x - menuWidth : props.x;
  const adjustedY = () => props.y + estimatedHeight() > window.innerHeight ? props.y - estimatedHeight() : props.y;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${adjustedX()}px`,
        top: `${adjustedY()}px`,
        "z-index": 9999,
        "min-width": `${menuWidth}px`,
        "box-shadow": "var(--shadow-lg)",
      }}
      class="bg-[var(--bg-overlay)] rounded-lg border border-[var(--border-default)] py-1 text-sm"
    >
      <For each={props.items}>
        {(item, i) => (
          <Show when={!item.separator} fallback={<div class="my-1 border-t border-[var(--border-subtle)]" />}>
            <button
              disabled={item.disabled}
              class={`w-full text-left px-3 py-1.5 rounded transition-colors ${
                item.disabled
                  ? 'text-[var(--text-tertiary)] cursor-not-allowed'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] cursor-pointer'
              }`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (!item.disabled) {
                  item.action();
                  props.onClose();
                }
              }}
            >
              {item.label}
            </button>
          </Show>
        )}
      </For>
    </div>
  );
}
