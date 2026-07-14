import { For, Show } from 'solid-js';
import type { CanvasSource } from './sources';

interface DocumentPickerProps {
  sources: CanvasSource[];
  onSelect: (source: CanvasSource) => void;
  loadingId?: string | null;
}

interface RootGroup {
  root: string;
  /** Resolved directory of the root, if the server reported one. */
  rootDir?: string;
  sources: CanvasSource[];
}

/** Group sources by their root, preserving first-seen order. */
function groupByRoot(sources: CanvasSource[]): RootGroup[] {
  const groups = new Map<string, RootGroup>();
  for (const source of sources) {
    const key = source.root || 'workspace';
    const group = groups.get(key);
    if (group) group.sources.push(source);
    else groups.set(key, { root: key, rootDir: source.rootDir, sources: [source] });
  }
  return [...groups.values()];
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
              {(group) => (
                <section>
                  <div class="mb-1">
                    <h2 class="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                      {group.root}
                    </h2>
                    <Show when={group.rootDir}>
                      <p class="truncate text-[10px] text-fg-subtle" title={group.rootDir}>
                        {group.rootDir}
                      </p>
                    </Show>
                  </div>
                  <ul class="max-h-56 divide-y divide-border-subtle overflow-y-auto">
                    <For each={group.sources}>
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
