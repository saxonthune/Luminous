import { For, Show } from 'solid-js';
import type { CanvasSource } from './sources';

interface DocumentPickerProps {
  sources: CanvasSource[];
  onSelect: (source: CanvasSource) => void;
  loadingId?: string | null;
}

/** Group sources by their root, preserving first-seen order. */
function groupByRoot(sources: CanvasSource[]): Array<[string, CanvasSource[]]> {
  const groups = new Map<string, CanvasSource[]>();
  for (const source of sources) {
    const key = source.root || 'workspace';
    const list = groups.get(key);
    if (list) list.push(source);
    else groups.set(key, [source]);
  }
  return [...groups.entries()];
}

export function DocumentPicker(props: DocumentPickerProps) {
  const groups = () => groupByRoot(props.sources);

  return (
    <div class="flex flex-1 items-center justify-center bg-canvas">
      <div
        class="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-surface p-8"
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
              No canvases available. Check the roots in luminous.config.json.
            </p>
          }
        >
          <div class="flex min-h-0 flex-col gap-5 overflow-y-auto">
            <For each={groups()}>
              {([root, sources]) => (
                <section>
                  <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    {root}
                  </h2>
                  <ul class="max-h-56 divide-y divide-border-subtle overflow-y-auto">
                    <For each={sources}>
                      {(source) => {
                        const isLoading = () => props.loadingId === source.id;
                        return (
                          <li>
                            <button
                              onClick={() => props.onSelect(source)}
                              disabled={!!props.loadingId}
                              class="flex w-full items-center justify-between py-3 text-left hover:text-accent disabled:opacity-60"
                            >
                              <span class="text-sm font-medium text-fg hover:text-accent">
                                {source.label}
                              </span>
                              <Show when={isLoading()}>
                                <span class="text-xs text-fg-muted">loading…</span>
                              </Show>
                            </button>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
