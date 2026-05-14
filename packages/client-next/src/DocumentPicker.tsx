import { For, Show } from 'solid-js';
import type { CanvasSource } from './sources';

interface DocumentPickerProps {
  sources: CanvasSource[];
  onSelect: (source: CanvasSource) => void;
  loadingId?: string | null;
}

export function DocumentPicker(props: DocumentPickerProps) {
  return (
    <div class="flex flex-1 items-center justify-center bg-canvas">
      <div
        class="w-full max-w-lg rounded-lg border border-border-subtle bg-surface p-8"
        style={{ 'box-shadow': 'var(--shadow-sm)' }}
      >
        <div class="mb-6">
          <h1 class="text-xl font-semibold text-fg">Canvases</h1>
          <p class="mt-1 text-sm text-fg-muted">Pick a document to open.</p>
        </div>
        <Show
          when={props.sources.length > 0}
          fallback={
            <p class="text-sm text-fg-muted">
              No canvases available. Check the allowlist in src/sources/allowlist.ts.
            </p>
          }
        >
          <ul class="divide-y divide-border-subtle">
            <For each={props.sources}>
              {(source) => {
                const isLoading = () => props.loadingId === source.id;
                return (
                  <li>
                    <button
                      onClick={() => props.onSelect(source)}
                      disabled={!!props.loadingId}
                      class="flex w-full items-center justify-between py-3 text-left hover:text-accent disabled:opacity-60"
                    >
                      <span class="text-sm font-medium text-fg hover:text-accent">{source.label}</span>
                      <Show when={isLoading()}>
                        <span class="text-xs text-fg-muted">loading…</span>
                      </Show>
                    </button>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
