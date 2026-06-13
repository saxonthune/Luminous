import { For, Show } from 'solid-js';

export interface Toast {
  id: string;
  message: string;
}

interface ToastTrayProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastTray(props: ToastTrayProps) {
  return (
    <Show when={props.toasts.length > 0}>
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '8px',
          'z-index': 1000,
        }}
      >
        <For each={props.toasts}>
          {(t) => (
            <div
              class="rounded bg-surface px-3 py-2 text-sm text-fg"
              style={{ 'box-shadow': 'var(--shadow-lg)', 'min-width': '240px', 'max-width': '360px' }}
            >
              <div class="flex items-start gap-3">
                <span class="flex-1">{t.message}</span>
                <button
                  onClick={() => props.onDismiss(t.id)}
                  class="text-fg-muted hover:text-fg"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
