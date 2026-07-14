import { createSignal, createEffect, Match, Switch, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { loadGraphFromText, resetRegistry, type Graph } from '@luminous/core';
import { loadAndRegisterSiblingPack } from '../../pack/siblingLoader';
import { DocumentPicker } from '../../DocumentPicker';
import { CanvasHost } from '../../CanvasHost';
import { ToastTray, type Toast } from '../../ToastTray';
import { fetchServerSources, fetchStaticSources, type CanvasSource } from '../../sources';
import { InfoModal } from '../../InfoModal';
import { readParam, writeParam } from '../../urlState';

type CanvasAppState =
  | { kind: 'booting' }
  | { kind: 'picker' }
  | { kind: 'loadingDoc' }
  | { kind: 'canvasMounted' }
  | { kind: 'fatalError'; reason: string };

export function CanvasApp() {
  const initialSrc = readParam('src');

  const [shell, setShell] = createSignal<CanvasAppState>({ kind: 'booting' });
  const [sources, setSources] = createSignal<CanvasSource[] | null>(null);
  const [sourceId, setSourceId] = createSignal<string | null>(null);
  const [graph, setGraph] = createSignal<Graph | null>(null);
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [showInfo, setShowInfo] = createSignal(false);

  function enqueueToast(message: string) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => dismissToast(id), 6000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function loadGraph(id: string) {
    const source = sources()?.find((s) => s.id === id);
    if (!source) {
      enqueueToast(`Canvas "${id}" not found`);
      setShell({ kind: 'picker' });
      setSourceId(null);
      writeParam('src', null);
      return;
    }
    source
      .load()
      .then(async (text) => {
        try {
          resetRegistry();
          await loadAndRegisterSiblingPack(source.id, text);
          const g = loadGraphFromText(text);
          setGraph(g);
          setShell({ kind: 'canvasMounted' });
        } catch (e) {
          handleGraphFailed(source.label, e);
        }
      })
      .catch((e: unknown) => handleGraphFailed(source.label, e));
  }

  function handleGraphFailed(label: string, e: unknown) {
    console.error(`[loadGraph] "${label}" failed:`, e);
    const msg = e instanceof Error ? e.message : String(e);
    enqueueToast(`Failed to load "${label}": ${msg}`);
    setSourceId(null);
    setGraph(null);
    writeParam('src', null);
    setShell({ kind: 'picker' });
  }

  function onSelect(source: CanvasSource) {
    setSourceId(source.id);
    setGraph(null);
    writeParam('src', source.id);
    setShell({ kind: 'loadingDoc' });
    loadGraph(source.id);
  }

  function onBack() {
    setGraph(null);
    setSourceId(null);
    writeParam('src', null);
    setShell({ kind: 'picker' });
  }

  function onRetry() {
    setShell({ kind: 'booting' });
    boot();
  }

  function boot() {
    const fetchSources = __GITHUB_PAGES__ ? fetchStaticSources : fetchServerSources;
    fetchSources()
      // eslint-disable-next-line solid/reactivity -- async continuation; setters are not reactive reads
      .then((list) => {
        setSources(list);
        setShell({ kind: 'picker' });
        if (initialSrc && list.some((s) => s.id === initialSrc)) {
          setSourceId(initialSrc);
          setShell({ kind: 'loadingDoc' });
          loadGraph(initialSrc);
        }
      })
      .catch((e: unknown) => {
        const reason = e instanceof Error ? e.message : String(e);
        setShell({ kind: 'fatalError', reason });
      });
  }

  createEffect(() => {
    const label = sourceLabel();
    document.title = label ? `${label} — Luminous` : 'Luminous';
  });

  onMount(() => {
    boot();
  });

  const sourceLabel = () => {
    const id = sourceId();
    if (!id) return null;
    return sources()?.find((s) => s.id === id)?.label ?? id;
  };

  return (
    <>
      <Portal mount={document.getElementById('app-header-left')!}>
        <Show when={shell().kind === 'canvasMounted'}>
          <button
            onClick={onBack}
            class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg"
            title="Back to canvases"
          >
            ← Back
          </button>
        </Show>
        <Show when={sourceLabel()}>
          <span class="text-sm text-fg-muted">·</span>
          <span class="text-sm text-fg-muted">{sourceLabel()}</span>
        </Show>
      </Portal>
      <Portal mount={document.getElementById('app-header-right')!}>
        <Show when={graph()?.info && graph()!.info!.trim()}>
          <button
            onClick={() => setShowInfo(true)}
            class="rounded px-2 py-1 text-base text-accent hover:bg-surface-alt"
            title="About this canvas"
          >
            ⓘ
          </button>
        </Show>
      </Portal>
      <Show when={showInfo() && graph()?.info}>
        <InfoModal info={graph()!.info!} onClose={() => setShowInfo(false)} />
      </Show>
      <div style={{ flex: '1 1 auto', 'min-height': 0, display: 'flex', 'flex-direction': 'column' }}>
        <Switch>
          <Match when={shell().kind === 'booting'}>
            <div class="flex flex-1 items-center justify-center text-fg-muted">
              <span>Loading…</span>
            </div>
          </Match>
          <Match when={shell().kind === 'picker' || shell().kind === 'loadingDoc'}>
            <DocumentPicker
              sources={sources() ?? []}
              onSelect={onSelect}
              loadingId={shell().kind === 'loadingDoc' ? sourceId() : null}
            />
          </Match>
          <Match when={shell().kind === 'canvasMounted' && graph() && sourceId()}>
            <CanvasHost graph={graph()!} sourceId={sourceId()!} />
          </Match>
          <Match when={shell().kind === 'fatalError'}>
            {(() => {
              const s = shell();
              const reason = s.kind === 'fatalError' ? s.reason : '';
              return (
                <div class="flex flex-1 flex-col items-center justify-center gap-4">
                  <div class="text-fg">Failed to list canvases</div>
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
