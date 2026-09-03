import { createSignal, Match, Switch, onMount, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { DataflowDocument } from '@luminous/core/dataflow';
import { parseDataflowDocument } from '@luminous/core/dataflow';
import { DocumentPicker } from '../../DocumentPicker';
import { ToastTray, type Toast } from '../../ToastTray';
import {
  fetchServerSources,
  fetchStaticSources,
  copyDocument,
  moveDocument,
  deleteDocument,
  writeDocument,
  type CanvasSource,
} from '../../sources';
import { readParam, writeParam } from '../../urlState';
import { watchDocuments } from '../../ws/watchClient';
import { DataflowCanvas } from './DataflowCanvas';
import { RenameDialog } from './RenameDialog';

type DataflowAppState =
  | { kind: 'booting' }
  | { kind: 'picker' }
  | { kind: 'loadingDoc' }
  | { kind: 'mounted' }
  | { kind: 'error'; reason: string };

export function DataflowApp() {
  const initialSrc = readParam('src');

  const [shell, setShell] = createSignal<DataflowAppState>({ kind: 'booting' });
  const [sources, setSources] = createSignal<CanvasSource[] | null>(null);
  const [sourceId, setSourceId] = createSignal<string | null>(null);
  const [doc, setDoc] = createSignal<DataflowDocument | null>(null);
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [renaming, setRenaming] = createSignal<CanvasSource | null>(null);
  const [deleting, setDeleting] = createSignal<CanvasSource | null>(null);
  let ownWritesInFlight = 0;

  function enqueueToast(message: string) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => dismissToast(id), 6000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function loadDoc(id: string) {
    const source = sources()?.find((s) => s.id === id);
    if (!source) {
      enqueueToast(`Dataflow "${id}" not found`);
      setShell({ kind: 'picker' });
      setSourceId(null);
      writeParam('src', null);
      return;
    }
    source
      .load()
      .then((text) => {
        const result = parseDataflowDocument(text);
        if (!result.ok) {
          handleDocFailed(source.label, result.issues.join('; '));
          return;
        }
        setDoc(result.doc);
        setShell({ kind: 'mounted' });
      })
      .catch((e: unknown) => handleDocFailed(source.label, e instanceof Error ? e.message : String(e)));
  }

  function handleDocFailed(label: string, message: string) {
    console.error(`[loadDoc] "${label}" failed:`, message);
    enqueueToast(`Failed to load "${label}": ${message}`);
    setSourceId(null);
    setDoc(null);
    writeParam('src', null);
    setShell({ kind: 'picker' });
  }

  function onSelect(source: CanvasSource) {
    setSourceId(source.id);
    setDoc(null);
    writeParam('src', source.id);
    setShell({ kind: 'loadingDoc' });
    loadDoc(source.id);
  }

  async function dispatchDoc(next: DataflowDocument) {
    const id = sourceId();
    if (!id) return;
    setDoc(next);
    ownWritesInFlight += 1;
    const result = await writeDocument(id, next);
    if (!result.ok) {
      ownWritesInFlight -= 1;
      enqueueToast(`Failed to save changes: ${result.error}`);
      loadDoc(id);
    }
  }

  function onBack() {
    setDoc(null);
    setSourceId(null);
    writeParam('src', null);
    setShell({ kind: 'picker' });
  }

  function onRetry() {
    setShell({ kind: 'booting' });
    boot();
  }

  function dirOf(id: string): string {
    const slash = id.lastIndexOf('/');
    return slash === -1 ? '' : id.slice(0, slash + 1);
  }

  function refreshSources() {
    return fetchServerSources('.dataflow.json').then((list) => setSources(list));
  }

  async function handleDuplicate(source: CanvasSource) {
    const dir = dirOf(source.id);
    let to = `${dir}${source.label}-copy.dataflow.json`;
    let result = await copyDocument(source.id, to);
    let attempt = 2;
    while (!result.ok && result.error === 'target exists' && attempt <= 20) {
      to = `${dir}${source.label}-copy-${attempt}.dataflow.json`;
      result = await copyDocument(source.id, to);
      attempt += 1;
    }
    if (result.ok) {
      await refreshSources();
      enqueueToast(`Duplicated "${source.label}"`);
    } else {
      enqueueToast(`Failed to duplicate "${source.label}": ${result.error}`);
    }
  }

  async function handleRenameSubmit(newSlug: string) {
    const source = renaming();
    if (!source) return;
    const dir = dirOf(source.id);
    const to = `${dir}${newSlug}.dataflow.json`;
    const result = await moveDocument(source.id, to);
    setRenaming(null);
    if (result.ok) {
      await refreshSources();
      enqueueToast(`Renamed "${source.label}" to "${newSlug}"`);
    } else {
      enqueueToast(`Failed to rename "${source.label}": ${result.error}`);
    }
  }

  async function handleDeleteConfirm() {
    const source = deleting();
    if (!source) return;
    const result = await deleteDocument(source.id);
    setDeleting(null);
    if (result.ok) {
      await refreshSources();
      enqueueToast(`Deleted "${source.label}"`);
    } else {
      enqueueToast(`Failed to delete "${source.label}": ${result.error}`);
    }
  }

  function boot() {
    const fetchSources = __STATIC__
      ? () => fetchStaticSources('.dataflow.json')
      : () => fetchServerSources('.dataflow.json');
    fetchSources()
      // eslint-disable-next-line solid/reactivity -- async continuation; setters are not reactive reads
      .then((list) => {
        setSources(list);
        setShell({ kind: 'picker' });
        if (initialSrc && list.some((s) => s.id === initialSrc)) {
          setSourceId(initialSrc);
          setShell({ kind: 'loadingDoc' });
          loadDoc(initialSrc);
        }
      })
      .catch((e: unknown) => {
        const reason = e instanceof Error ? e.message : String(e);
        setShell({ kind: 'error', reason });
      });
  }

  onMount(() => {
    boot();
    // eslint-disable-next-line solid/reactivity -- WS callback, not a render path; sourceId() read is intentionally untracked
    const dispose = watchDocuments((path) => {
      if (path !== sourceId()) return;
      if (ownWritesInFlight > 0) {
        ownWritesInFlight -= 1;
        return;
      }
      loadDoc(path);
    });
    onCleanup(dispose);
  });

  const sourceLabel = () => {
    const id = sourceId();
    if (!id) return null;
    return sources()?.find((s) => s.id === id)?.label ?? id;
  };

  return (
    <>
      <Portal mount={document.getElementById('app-header-left')!}>
        <Show when={shell().kind === 'mounted'}>
          <button
            onClick={onBack}
            class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
            title="Back to dataflows"
          >
            ← Back
          </button>
        </Show>
        <Show when={sourceLabel()}>
          <span class="text-sm text-fg-muted">·</span>
          <span class="text-sm text-fg-muted">{sourceLabel()}</span>
        </Show>
      </Portal>
      <div style={{ flex: '1 1 auto', 'min-height': 0, display: 'flex', 'flex-direction': 'column' }}>
        <Switch>
          <Match when={shell().kind === 'booting'}>
            <div class="flex flex-1 items-center justify-center text-fg-muted">
              <span>Loading…</span>
            </div>
          </Match>
          <Match when={shell().kind === 'picker' || shell().kind === 'loadingDoc'}>
            <div class="flex flex-1 flex-col">
              <DocumentPicker
                heading="Dataflows"
                sources={sources() ?? []}
                onSelect={onSelect}
                loadingId={shell().kind === 'loadingDoc' ? sourceId() : null}
                onRename={__STATIC__ ? undefined : (s) => setRenaming(s)}
                onDuplicate={__STATIC__ ? undefined : handleDuplicate}
                onDelete={__STATIC__ ? undefined : (s) => setDeleting(s)}
              />
            </div>
          </Match>
          <Match when={shell().kind === 'mounted' && doc()}>
            <DataflowCanvas doc={doc()!} onDocChange={(next) => void dispatchDoc(next)} />
          </Match>
          <Match when={shell().kind === 'error'}>
            {(() => {
              const s = shell();
              const reason = s.kind === 'error' ? s.reason : '';
              return (
                <div class="flex flex-1 flex-col items-center justify-center gap-4">
                  <div class="text-fg">Failed to list dataflows</div>
                  <div class="text-sm text-fg-muted">{reason}</div>
                  <button
                    onClick={onRetry}
                    class="rounded bg-accent px-3 py-1 text-sm text-on-accent hover:bg-accent-hover"
                  >
                    Retry
                  </button>
                </div>
              );
            })()}
          </Match>
        </Switch>
      </div>
      <Show when={renaming()}>
        {(source) => (
          <RenameDialog
            source={source()}
            onSubmit={handleRenameSubmit}
            onCancel={() => setRenaming(null)}
          />
        )}
      </Show>
      <Show when={deleting()}>
        {(source) => (
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setDeleting(null)}
          >
            <div
              class="w-full max-w-sm rounded-lg border border-border-subtle bg-surface p-6"
              style={{ 'box-shadow': 'var(--shadow-sm)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 class="mb-4 text-lg font-semibold text-fg">Delete</h2>
              <p class="text-sm text-fg-muted">
                Delete "{source().label}.dataflow.json"? This cannot be undone.
              </p>
              <div class="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setDeleting(null)}
                  class="rounded px-3 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  class="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
      <ToastTray toasts={toasts()} onDismiss={dismissToast} />
    </>
  );
}
