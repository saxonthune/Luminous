import { createSignal, onMount, Show, For } from 'solid-js';
import { listDocuments, type DocumentMeta } from './api';

interface DocumentPickerProps {
  onOpen: (path: string) => void;
}

export function DocumentPicker(props: DocumentPickerProps) {
  const [documents, setDocuments] = createSignal<DocumentMeta[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [newName, setNewName] = createSignal('');
  const [creating, setCreating] = createSignal(false);

  onMount(() => {
    listDocuments()
      .then(setDocuments)
      .finally(() => setLoading(false));
  });

  function handleCreate() {
    const trimmed = newName().trim();
    if (!trimmed) return;
    const path = trimmed.endsWith('.canvas.json') ? trimmed : `${trimmed}.canvas.json`;
    setNewName('');
    setCreating(false);
    props.onOpen(path);
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div class="flex h-screen items-center justify-center bg-canvas">
      <div class="w-full max-w-lg rounded-lg bg-surface p-8" style={{ "box-shadow": "var(--shadow-sm)" }}>
        <div class="mb-6 flex items-center justify-between">
          <h1 class="text-xl font-semibold text-fg">Canvases</h1>
          <Show when={!creating()}>
            <button
              onClick={() => setCreating(true)}
              class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
            >
              New canvas
            </button>
          </Show>
        </div>

        <Show when={creating()}>
          <div class="mb-4 flex gap-2">
            <input
              autofocus
              type="text"
              placeholder="Canvas name"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                }
              }}
              class="flex-1 rounded-md border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none bg-input text-fg"
            />
            <button
              onClick={handleCreate}
              disabled={!newName().trim()}
              class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
              class="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-alt"
            >
              Cancel
            </button>
          </div>
        </Show>

        <Show when={!loading()} fallback={<p class="text-sm text-fg-muted">Loading...</p>}>
          <Show
            when={documents().length > 0}
            fallback={
              <p class="text-sm text-fg-muted">
                No canvases yet. Create one to get started.
              </p>
            }
          >
            <ul class="divide-y divide-border-subtle">
              <For each={documents()}>
                {(doc) => (
                  <li>
                    <button
                      onClick={() => props.onOpen(doc.path)}
                      class="flex w-full items-center justify-between py-3 text-left hover:text-accent"
                    >
                      <span class="text-sm font-medium text-fg hover:text-accent">
                        {doc.name}
                      </span>
                      <span class="text-xs text-fg-subtle">
                        {formatDate(doc.lastModified)}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </div>
  );
}
