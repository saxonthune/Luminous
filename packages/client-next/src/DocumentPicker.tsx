import { For, Show } from 'solid-js';
import type { CanvasSource } from './sources';

interface DocumentPickerProps {
  sources: CanvasSource[];
  onSelect: (source: CanvasSource) => void;
}

export function DocumentPicker(props: DocumentPickerProps) {
  return (
    <div class="flex h-screen items-center justify-center bg-canvas">
      <div class="w-full max-w-lg rounded-lg bg-surface p-8" style={{ 'box-shadow': 'var(--shadow-sm)' }}>
        <div class="mb-6">
          <h1 class="text-xl font-semibold text-fg">Canvases</h1>
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
              {(source) => (
                <li>
                  <button
                    onClick={() => props.onSelect(source)}
                    class="flex w-full items-center py-3 text-left hover:text-accent"
                  >
                    <span class="text-sm font-medium text-fg hover:text-accent">
                      {source.label}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
