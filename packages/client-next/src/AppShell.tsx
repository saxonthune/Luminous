import { createSignal, createEffect, Match, Switch, onCleanup, onMount } from 'solid-js';
import { loadGraphFromText, resetRegistry, type Graph } from '@luminous/core';
import { loadAndRegisterSiblingPack } from './pack/siblingLoader';
import { DocumentPicker } from './DocumentPicker';
import { AppHeader } from './AppHeader';
import { CanvasHost } from './CanvasHost';
import { ToastTray, type Toast } from './ToastTray';
import { fetchServerSources, fetchStaticSources, type CanvasSource } from './sources';
import { theme, cycleTheme, persistTheme } from './theme';

type ShellState =
  | { kind: 'booting' }
  | { kind: 'picker' }
  | { kind: 'loadingDoc' }
  | { kind: 'canvasMounted' }
  | { kind: 'fatalError'; reason: string };

export function AppShell() {
  const params = new URLSearchParams(window.location.search);
  const initialSrc = params.get('src');

  const [shell, setShell] = createSignal<ShellState>({ kind: 'booting' });
  const [sources, setSources] = createSignal<CanvasSource[] | null>(null);
  const [sourceId, setSourceId] = createSignal<string | null>(null);
  const [graph, setGraph] = createSignal<Graph | null>(null);
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  function enqueueToast(message: string) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => dismissToast(id), 6000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function writeUrlSrc(id: string | null) {
    if (id) history.replaceState(null, '', '?src=' + id);
    else history.replaceState(null, '', window.location.pathname);
  }

  function loadGraph(id: string) {
    const source = sources()?.find((s) => s.id === id);
    if (!source) {
      enqueueToast(`Canvas "${id}" not found`);
      setShell({ kind: 'picker' });
      setSourceId(null);
      writeUrlSrc(null);
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
    writeUrlSrc(null);
    setShell({ kind: 'picker' });
  }

  function onSelect(source: CanvasSource) {
    setSourceId(source.id);
    setGraph(null);
    writeUrlSrc(source.id);
    setShell({ kind: 'loadingDoc' });
    loadGraph(source.id);
  }

  function onBack() {
    setGraph(null);
    setSourceId(null);
    writeUrlSrc(null);
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

  createEffect(() => persistTheme(theme()));

  createEffect(() => {
    const label = sourceLabel();
    document.title = label ? `${label} — Luminous` : 'Luminous';
  });

  onMount(() => {
    boot();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        cycleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  const sourceLabel = () => {
    const id = sourceId();
    if (!id) return null;
    return sources()?.find((s) => s.id === id)?.label ?? id;
  };

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', width: '100vw', height: '100vh' }}>
      <AppHeader
        sourceLabel={sourceLabel()}
        showBack={shell().kind === 'canvasMounted'}
        onBack={onBack}
        onCycleTheme={cycleTheme}
        info={graph()?.info}
      />
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
    </div>
  );
}
