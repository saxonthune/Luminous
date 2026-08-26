import { createSignal, Match, Switch, onMount, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { AtlasData, AtlasDocument } from '@luminous/core/atlas';
import { parseAtlasDocument, serializeAtlasDocument } from '@luminous/core/atlas';
import { DocumentPicker } from '../../DocumentPicker';
import { ToastTray, type Toast } from '../../ToastTray';
import { fetchServerSources, writeDocument, type CanvasSource } from '../../sources';
import { readParam, writeParam } from '../../urlState';
import { watchDocuments } from '../../ws/watchClient';
import { AtlasCanvas } from './AtlasCanvas.tsx';
import { atlasDataPathFor, loadAtlasData } from './dataLoader.ts';

type AtlasAppState =
  | { kind: 'booting' }
  | { kind: 'picker' }
  | { kind: 'loadingDoc' }
  | { kind: 'mounted' }
  | { kind: 'error'; reason: string };

export function AtlasApp() {
  const initialSrc = readParam('src');

  const [shell, setShell] = createSignal<AtlasAppState>({ kind: 'booting' });
  const [sources, setSources] = createSignal<CanvasSource[] | null>(null);
  const [sourceId, setSourceId] = createSignal<string | null>(null);
  const [doc, setDoc] = createSignal<AtlasDocument | null>(null);
  const [data, setData] = createSignal<AtlasData | undefined>(undefined);
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  let ownWritesInFlight = 0;

  function enqueueToast(message: string) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => dismissToast(id), 6000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // R6: a reserved, non-expiring toast slot for the pending-membership-change
  // preview — its lifetime is the drag, not a timer, so it uses a fixed id
  // instead of enqueueToast's random one.
  const DRAG_TOAST_ID = 'atlas-drag-pending';
  function setDragToast(message: string | null) {
    setToasts((prev) => {
      const rest = prev.filter((t) => t.id !== DRAG_TOAST_ID);
      return message ? [...rest, { id: DRAG_TOAST_ID, message }] : rest;
    });
  }

  // R51: same fixed-slot pattern as DRAG_TOAST_ID — the toast's lifetime is
  // the in-progress Edge preview, not a timer.
  const EDGE_TOAST_ID = 'atlas-edge-preview';
  function setEdgeToast(message: string | null) {
    setToasts((prev) => {
      const rest = prev.filter((t) => t.id !== EDGE_TOAST_ID);
      return message ? [...rest, { id: EDGE_TOAST_ID, message }] : rest;
    });
  }

  function loadDoc(id: string) {
    const source = sources()?.find((s) => s.id === id);
    if (!source) {
      enqueueToast(`Atlas "${id}" not found`);
      setShell({ kind: 'picker' });
      setSourceId(null);
      writeParam('src', null);
      return;
    }
    source
      .load()
      .then((text) => {
        const result = parseAtlasDocument(text);
        if (!result.ok) {
          handleDocFailed(source.label, result.issues.join('; '));
          return;
        }
        setDoc(result.doc);
        setShell({ kind: 'mounted' });
        loadAtlasData(id).then(setData);
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

  async function dispatchDoc(next: AtlasDocument) {
    const id = sourceId();
    if (!id) return;
    setDoc(next);
    ownWritesInFlight += 1;
    const result = await writeDocument(id, JSON.parse(serializeAtlasDocument(next)));
    if (!result.ok) {
      ownWritesInFlight -= 1;
      enqueueToast(`Failed to save changes: ${result.error}`);
      loadDoc(id);
    }
  }

  function onSelect(source: CanvasSource) {
    setSourceId(source.id);
    setDoc(null);
    setData(undefined);
    writeParam('src', source.id);
    setShell({ kind: 'loadingDoc' });
    loadDoc(source.id);
  }

  function onBack() {
    setDoc(null);
    setData(undefined);
    setSourceId(null);
    writeParam('src', null);
    setShell({ kind: 'picker' });
  }

  function onRetry() {
    setShell({ kind: 'booting' });
    boot();
  }

  function boot() {
    if (__GITHUB_PAGES__) {
      setSources([]);
      setShell({ kind: 'picker' });
      return;
    }
    fetchServerSources('.atlas.json')
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
      const id = sourceId();
      if (id && path === atlasDataPathFor(id)) {
        loadAtlasData(id).then(setData);
        return;
      }
      if (path !== id) return;
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
            title="Back to atlases"
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
                heading="Atlases"
                sources={sources() ?? []}
                onSelect={onSelect}
                loadingId={shell().kind === 'loadingDoc' ? sourceId() : null}
              />
              <Show when={__GITHUB_PAGES__}>
                <p class="pb-4 text-center text-xs text-fg-subtle">
                  Atlas documents are served by the local Luminous server — not available on
                  this static site.
                </p>
              </Show>
            </div>
          </Match>
          <Match when={shell().kind === 'mounted' && doc()}>
            <AtlasCanvas
              doc={doc()!}
              data={data()}
              dispatchDoc={dispatchDoc}
              onPendingMembershipChange={setDragToast}
              onDropRefused={(message) => enqueueToast(message)}
              onEdgePreviewChange={setEdgeToast}
            />
          </Match>
          <Match when={shell().kind === 'error'}>
            {(() => {
              const s = shell();
              const reason = s.kind === 'error' ? s.reason : '';
              return (
                <div class="flex flex-1 flex-col items-center justify-center gap-4">
                  <div class="text-fg">Failed to list atlases</div>
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
      <ToastTray toasts={toasts()} onDismiss={dismissToast} />
    </>
  );
}
