import { onMount, onCleanup } from 'solid-js';
import type { Action } from './types.js';
import { matchesHotkey } from './parseHotkey.js';

export function useHotkeys(
  actions: () => Action[],
  onAction: (id: string, payload?: unknown) => void,
): void {
  const handler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.isContentEditable) return;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    for (const action of actions()) {
      if (!action.hotkey) continue;
      if (action.enabled === false) continue;
      if (matchesHotkey(e, action.hotkey)) {
        e.preventDefault();
        onAction(action.id, action.payload);
        return;
      }
    }
  };

  onMount(() => window.addEventListener('keydown', handler));
  onCleanup(() => window.removeEventListener('keydown', handler));
}
