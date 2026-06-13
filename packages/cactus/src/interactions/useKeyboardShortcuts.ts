import { onCleanup } from 'solid-js';

export interface KeyboardShortcut {
  key: string | string[];
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  mod?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  disabled?: boolean;
}

export function useKeyboardShortcuts({ shortcuts, disabled = false }: UseKeyboardShortcutsOptions): void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;

    const target = event.target as HTMLElement;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    ) {
      return;
    }

    for (const shortcut of shortcuts) {
      const keys = Array.isArray(shortcut.key) ? shortcut.key : [shortcut.key];
      if (!keys.includes(event.key)) continue;

      const isMac = navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');

      if (shortcut.mod !== undefined) {
        const modPressed = isMac ? event.metaKey : event.ctrlKey;
        if (shortcut.mod !== modPressed) continue;
      } else {
        if (shortcut.ctrl !== undefined && shortcut.ctrl !== event.ctrlKey) continue;
        if (shortcut.meta !== undefined && shortcut.meta !== event.metaKey) continue;
      }

      if (shortcut.shift !== undefined && shortcut.shift !== event.shiftKey) continue;
      if (shortcut.alt !== undefined && shortcut.alt !== event.altKey) continue;

      const hasModifierSpec = shortcut.mod !== undefined ||
        shortcut.ctrl !== undefined || shortcut.meta !== undefined ||
        shortcut.shift !== undefined || shortcut.alt !== undefined;
      if (!hasModifierSpec) {
        if (event.ctrlKey || event.metaKey || event.altKey) continue;
      }

      event.preventDefault();
      shortcut.action();
      return;
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
}
