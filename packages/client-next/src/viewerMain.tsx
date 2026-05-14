import { render } from 'solid-js/web';
import { createSignal, createMemo, Show } from 'solid-js';
import './index.css';
import { loadCanvasFileFromText, type Graph, type View } from '@luminous/canvas-core';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';
import { ensurePacksRegistered } from './registerPacks';
import { PgCanvasView } from './PgCanvasView';
import { ViewSwitcher } from './views/ViewSwitcher';
import { LayerToolbar } from './layers/LayerToolbar';
import { defaultCanvasText, defaultCanvasId } from './defaultCanvas';

function ViewerApp() {
  ensurePacksRegistered();

  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');
  const canvasIdFromUrl = src ? src.split('/').pop()?.replace(/\.canvas\.json$/, '') : null;

  const [graph, setGraph] = createSignal<Graph | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [activeViewId, setActiveViewId] = createSignal<string>(rtpStatechartPack.views[0].id);

  const loadPromise = src
    ? fetch(src).then((r) => r.text())
    : Promise.resolve(defaultCanvasText);

  loadPromise
    .then((text) => {
      try {
        setGraph(loadCanvasFileFromText(text));
      } catch (e) {
        setError(`Invalid canvas file: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
    .catch((e) => setError(`Failed to load canvas: ${e instanceof Error ? e.message : String(e)}`));

  const canvasId = canvasIdFromUrl ?? defaultCanvasId;
  const activeView = createMemo<View>(() => {
    const v = rtpStatechartPack.views.find((vw) => vw.id === activeViewId());
    return v ?? rtpStatechartPack.views[0];
  });
  const activeLayers = createMemo(() =>
    rtpStatechartPack.layers.filter((l) => l.id in activeView().layers)
  );

  return (
    <Show
      when={graph() && !error()}
      fallback={
        <div class="flex h-screen items-center justify-center">
          <Show when={error()} fallback={<span>Loading…</span>}>
            <span style={{ color: '#b00' }}>{error()}</span>
          </Show>
        </div>
      }
    >
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <ViewSwitcher
          views={rtpStatechartPack.views}
          activeViewId={activeViewId()}
          onChange={setActiveViewId}
        />
        <LayerToolbar
          canvasId={canvasId}
          viewId={activeViewId()}
          layers={activeLayers()}
        />
        <PgCanvasView graph={graph()!} view={activeView()} />
      </div>
    </Show>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('No root element');
render(() => <ViewerApp />, root);
