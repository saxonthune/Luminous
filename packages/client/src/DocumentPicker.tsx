import { For, Show, createSignal, onMount, onCleanup } from 'solid-js';
import type { CanvasSource } from './sources';

interface DocumentPickerProps {
  sources: CanvasSource[];
  onSelect: (source: CanvasSource) => void;
  loadingId?: string | null;
  heading?: string;
  onRename?: (source: CanvasSource) => void;
  onDuplicate?: (source: CanvasSource) => void;
  onDelete?: (source: CanvasSource) => void;
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
  const hasRowActions = () => !!(props.onRename || props.onDuplicate || props.onDelete);
  const [openMenuId, setOpenMenuId] = createSignal<string | null>(null);

  function closeMenu() {
    setOpenMenuId(null);
  }

  function toggleMenu(e: MouseEvent, id: string) {
    e.stopPropagation();
    setOpenMenuId((prev) => (prev === id ? null : id));
  }

  function runAction(e: MouseEvent, action: (source: CanvasSource) => void, source: CanvasSource) {
    e.stopPropagation();
    closeMenu();
    action(source);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeMenu();
  }

  onMount(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', onKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div class="flex flex-1 items-center justify-center bg-canvas">
      <div
        class="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border-subtle bg-surface p-8"
        style={{ 'box-shadow': 'var(--shadow-sm)' }}
      >
        <div class="mb-6">
          <h1 class="text-xl font-semibold text-fg">{props.heading ?? 'Canvases'}</h1>
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
                          <li class="relative flex items-center">
                            <button
                              onClick={() => props.onSelect(source)}
                              disabled={!!props.loadingId}
                              class="flex flex-1 items-center justify-between py-3 text-left hover:text-accent disabled:opacity-60"
                            >
                              <span class="text-sm font-medium text-fg hover:text-accent">
                                {source.label}
                              </span>
                              <Show when={isLoading()}>
                                <span class="text-xs text-fg-muted">loading…</span>
                              </Show>
                            </button>
                            <Show when={hasRowActions()}>
                              <button
                                onClick={(e) => toggleMenu(e, source.id)}
                                class="ml-2 rounded px-2 py-1 text-fg-muted hover:bg-surface-alt hover:text-fg"
                                title="More actions"
                              >
                                ⋯
                              </button>
                              <Show when={openMenuId() === source.id}>
                                <div
                                  class="absolute right-0 top-full z-10 min-w-[8rem] rounded-lg border border-border-subtle bg-surface py-1"
                                  style={{ 'box-shadow': 'var(--shadow-sm)' }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Show when={props.onRename}>
                                    <button
                                      onClick={(e) => runAction(e, props.onRename!, source)}
                                      class="block w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-alt"
                                    >
                                      Rename
                                    </button>
                                  </Show>
                                  <Show when={props.onDuplicate}>
                                    <button
                                      onClick={(e) => runAction(e, props.onDuplicate!, source)}
                                      class="block w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-alt"
                                    >
                                      Duplicate
                                    </button>
                                  </Show>
                                  <Show when={props.onDelete}>
                                    <button
                                      onClick={(e) => runAction(e, props.onDelete!, source)}
                                      class="block w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-surface-alt"
                                    >
                                      Delete
                                    </button>
                                  </Show>
                                </div>
                              </Show>
                            </Show>
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
