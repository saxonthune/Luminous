import { onMount, onCleanup, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

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
  /** Optional non-interactive info row shown at the top of the menu (e.g. node title + id). */
  header?: string;
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

  const menuWidth = 200;
  const menuItemHeight = 28;
  const separatorHeight = 9;
  const headerHeight = 30;
  const padding = 8;
  const itemCount = () => props.items.filter((i) => !i.separator).length;
  const sepCount = () => props.items.filter((i) => i.separator).length;
  const estimatedHeight = () =>
    itemCount() * menuItemHeight +
    sepCount() * separatorHeight +
    (props.header ? headerHeight : 0) +
    padding * 2;

  const adjustedX = () => props.x + menuWidth > window.innerWidth ? props.x - menuWidth : props.x;
  const adjustedY = () => props.y + estimatedHeight() > window.innerHeight ? props.y - estimatedHeight() : props.y;

  return (
    <Portal>
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
        <Show when={props.header}>
          <div
            class="px-3 py-1.5 text-xs text-[var(--text-tertiary)] font-mono truncate border-b border-[var(--border-subtle)] mb-1 select-text"
            onMouseDown={(e) => e.stopPropagation()}
            title={props.header}
          >
            {props.header}
          </div>
        </Show>
        <For each={props.items}>
          {(item) => (
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
    </Portal>
  );
}
