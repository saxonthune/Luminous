import { createSignal, Match, Switch, onMount, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { MerinoDocument } from '@luminous/core/merino';
import { emptyMerinoDocument, parseMerinoDocument, serializeMerinoDocument } from '@luminous/core/merino';
import { DocumentPicker } from '../../DocumentPicker';
import { ToastTray, type Toast } from '../../ToastTray';
import { fetchServerSources, writeDocument, type CanvasSource } from '../../sources';
import { readParam, writeParam } from '../../urlState';
import { watchDocuments } from '../../ws/watchClient';
import { MerinoCanvas } from './MerinoCanvas.tsx';
import { NewDocumentDialog } from './NewDocumentDialog';

type MerinoAppState =
  | { kind: 'booting' }
  | { kind: 'picker' }
  | { kind: 'loadingDoc' }
  | { kind: 'mounted' }
  | { kind: 'error'; reason: string };

export function MerinoApp() {
  const initialSrc = readParam('src');

  const [shell, setShell] = createSignal<MerinoAppState>({ kind: 'booting' });
  const [sources, setSources] = createSignal<CanvasSource[] | null>(null);
  const [sourceId, setSourceId] = createSignal<string | null>(null);
  const [doc, setDoc] = createSignal<MerinoDocument | null>(null);
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [creatingIn, setCreatingIn] = createSignal<CanvasSource | null>(null);
  let ownWritesInFlight = 0;

  function enqueueToast(message: string) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => dismissToast(id), 6000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // The Edge preview exists exactly for the duration of its gesture, rather
  // than for ToastTray's normal timeout.
  const EDGE_TOAST_ID = 'merino-edge-preview';
  function setEdgeToast(message: string | null) {
    setToasts((prev) => {
      const rest = prev.filter((toast) => toast.id !== EDGE_TOAST_ID);
      return message ? [...rest, { id: EDGE_TOAST_ID, message }] : rest;
    });
  }

  function loadDoc(id: string) {
    const source = sources()?.find((s) => s.id === id);
    if (!source) {
      enqueueToast(`Merino document "${id}" not found`);
      setShell({ kind: 'picker' });
      setSourceId(null);
      writeParam('src', null);
      return;
    }
    source
      .load()
      .then((text) => {
        const result = parseMerinoDocument(text);
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

  async function dispatchDoc(next: MerinoDocument) {
    const id = sourceId();
    if (!id) return;
    setDoc(next);
    ownWritesInFlight += 1;
    const result = await writeDocument(id, JSON.parse(serializeMerinoDocument(next)));
    if (!result.ok) {
      ownWritesInFlight -= 1;
      enqueueToast(`Failed to save changes: ${result.error}`);
      loadDoc(id);
    }
  }

  function onSelect(source: CanvasSource) {
    setSourceId(source.id);
    setDoc(null);
    writeParam('src', source.id);
    setShell({ kind: 'loadingDoc' });
    loadDoc(source.id);
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

  /** Directory to show the user — the real filesystem path when known, else the namespaced id prefix. */
  function displayDirOf(source: CanvasSource): string {
    if (source.absPath) return dirOf(source.absPath);
    return dirOf(source.id);
  }

  function refreshSources() {
    return fetchServerSources('.merino.json').then((list) => setSources(list));
  }

  async function handleCreateSubmit(name: string) {
    const representative = creatingIn();
    if (!representative) return;
    const dir = dirOf(representative.id);
    const path = `${dir}${name}.merino.json`;
    const result = await writeDocument(path, JSON.parse(serializeMerinoDocument(emptyMerinoDocument())));
    setCreatingIn(null);
    if (!result.ok) {
      enqueueToast(`Failed to create "${name}": ${result.error}`);
      return;
    }
    await refreshSources();
    const created = sources()?.find((s) => s.id === path);
    onSelect(
      created ?? {
        id: path,
        label: name,
        root: representative.root,
        load: () => fetch('/api/document/' + encodeURIComponent(path)).then((r) => r.text()),
      }
    );
  }

  function boot() {
    if (__GITHUB_PAGES__) {
      setSources([]);
      setShell({ kind: 'picker' });
      return;
    }
    fetchServerSources('.merino.json')
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
            title="Back to Merino documents"
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
                heading="Merino documents"
                sources={sources() ?? []}
                onSelect={onSelect}
                loadingId={shell().kind === 'loadingDoc' ? sourceId() : null}
                onCreate={(source) => setCreatingIn(source)}
              />
              <Show when={__GITHUB_PAGES__}>
                <p class="pb-4 text-center text-xs text-fg-subtle">
                  Merino documents are served by the local Luminous server — not available on
                  this static site.
                </p>
              </Show>
            </div>
          </Match>
          <Match when={shell().kind === 'mounted' && doc()}>
            <MerinoCanvas
              doc={doc()!}
              sourceId={sourceId()!}
              dispatchDoc={dispatchDoc}
              onRefused={enqueueToast}
              onEdgePreviewChange={setEdgeToast}
            />
          </Match>
          <Match when={shell().kind === 'error'}>
            {(() => {
              const s = shell();
              const reason = s.kind === 'error' ? s.reason : '';
              return (
                <div class="flex flex-1 flex-col items-center justify-center gap-4">
                  <div class="text-fg">Failed to list Merino documents</div>
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
      <Show when={creatingIn()}>
        {(representative) => (
          <NewDocumentDialog
            dir={displayDirOf(representative())}
            existingLabels={
              sources()
                ?.filter((s) => dirOf(s.id) === dirOf(representative().id))
                .map((s) => s.label) ?? []
            }
            onSubmit={handleCreateSubmit}
            onCancel={() => setCreatingIn(null)}
          />
        )}
      </Show>
      <ToastTray toasts={toasts()} onDismiss={dismissToast} />
    </>
  );
}
