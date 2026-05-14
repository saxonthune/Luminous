import { createSignal, createEffect, createMemo, Show } from 'solid-js';
import { loadCanvasFileFromText, type Graph, type View } from '@luminous/canvas-core';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';
import { ensurePacksRegistered } from './registerPacks';
import { PgCanvasView, type ViewerHandle } from './PgCanvasView';
import { ViewSwitcher } from './views/ViewSwitcher';
import { LayerToolbar } from './layers/LayerToolbar';
import { LayoutToolbar, type LayoutAlgorithm } from './toolbar/LayoutToolbar';
import { DocumentPicker } from './DocumentPicker';
import { fetchServerSources, type CanvasSource } from './sources';

export function AppShell() {
  ensurePacksRegistered();

  const params = new URLSearchParams(window.location.search);
  const initialSrc = params.get('src');

  const [sources, setSources] = createSignal<CanvasSource[] | null>(null);
  const [selectedId, setSelectedId] = createSignal<string | null>(initialSrc);
  const [graph, setGraph] = createSignal<Graph | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [activeViewId, setActiveViewId] = createSignal<string>(rtpStatechartPack.views[0].id);
  const [algorithm, setAlgorithm] = createSignal<LayoutAlgorithm>('grid');
  const [viewerHandle, setViewerHandle] = createSignal<ViewerHandle | undefined>(undefined);

  fetchServerSources()
    .then(setSources)
    .catch((e: unknown) => {
      setError(`Failed to list canvases: ${e instanceof Error ? e.message : String(e)}`);
    });

  createEffect(() => {
    const srcs = sources();
    const id = selectedId();
    if (!srcs || !id) return;
    const source = srcs.find((s) => s.id === id);
    if (!source) return;
    source
      .load()
      .then((text) => {
        try {
          setGraph(loadCanvasFileFromText(text));
        } catch (e) {
          setError(`Invalid canvas file: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
      .catch((e: unknown) => {
        setError(`Failed to load canvas: ${e instanceof Error ? e.message : String(e)}`);
      });
  });

  function onSelect(source: CanvasSource) {
    setSelectedId(source.id);
    setGraph(null);
    setError(null);
    history.replaceState(null, '', '?src=' + source.id);
  }

  const canvasId = createMemo(() => {
    const id = selectedId();
    if (!id) return '';
    return id.split('/').pop()?.replace(/\.canvas\.json$/, '') ?? id;
  });

  const activeView = createMemo<View>(() => {
    const v = rtpStatechartPack.views.find((vw) => vw.id === activeViewId());
    return v ?? rtpStatechartPack.views[0];
  });

  const activeLayers = createMemo(() =>
    rtpStatechartPack.layers.filter((l) => l.id in activeView().layers)
  );

  return (
    <Show
      when={!error()}
      fallback={
        <div class="flex h-screen items-center justify-center">
          <span style={{ color: '#b00' }}>{error()}</span>
        </div>
      }
    >
      <Show
        when={sources() !== null}
        fallback={
          <div class="flex h-screen items-center justify-center">
            <span>Loading…</span>
          </div>
        }
      >
        <Show
          when={graph()}
          fallback={
            <DocumentPicker sources={sources()!} onSelect={onSelect} />
          }
        >
          {(g) => (
            <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
              <ViewSwitcher
                views={rtpStatechartPack.views}
                activeViewId={activeViewId()}
                onChange={setActiveViewId}
              />
              <LayerToolbar
                canvasId={canvasId()}
                viewId={activeViewId()}
                layers={activeLayers()}
              />
              <LayoutToolbar
                handle={viewerHandle}
                algorithm={algorithm}
                onAlgorithmChange={setAlgorithm}
              />
              <PgCanvasView
                graph={g()}
                view={activeView()}
                algorithm={algorithm()}
                ref={setViewerHandle}
              />
            </div>
          )}
        </Show>
      </Show>
    </Show>
  );
}
