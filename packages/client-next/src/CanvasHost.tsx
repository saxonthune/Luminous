import { createSignal, createMemo, Show } from 'solid-js';
import type { Graph, View, Layer, Pack } from '@luminous/core';
import { getPack } from '@luminous/core';
import { PgCanvasView, type ViewerHandle } from './PgCanvasView';
import { ViewSwitcher } from './views/ViewSwitcher';
import { LayerToolbar } from './layers/LayerToolbar';
import { LayoutToolbar, type LayoutAlgorithm } from './toolbar/LayoutToolbar';

interface CanvasHostProps {
  graph: Graph;
  sourceId: string;
}

export function CanvasHost(props: CanvasHostProps) {
  const [algorithm, setAlgorithm] = createSignal<LayoutAlgorithm>('grid');
  const [viewerHandle, setViewerHandle] = createSignal<ViewerHandle | undefined>(undefined);

  const canvasId = createMemo(
    () => props.sourceId.split('/').pop()?.replace(/\.graph\.json$/, '') ?? props.sourceId,
  );

  const declaredPacks = createMemo<Pack[]>(() =>
    Object.keys(props.graph.packs)
      .map((id) => getPack(id))
      .filter((p): p is Pack => Boolean(p))
  );

  const availableViews = createMemo<View[]>(() => declaredPacks().flatMap((p) => p.views));
  const availableLayers = createMemo<Layer[]>(() => declaredPacks().flatMap((p) => p.layers));

  const [activeViewId, setActiveViewId] = createSignal<string>('');
  const activeView = createMemo<View | undefined>(
    () => availableViews().find((v) => v.id === activeViewId()) ?? availableViews()[0],
  );
  const activeLayers = createMemo<Layer[]>(() =>
    activeView() ? availableLayers().filter((l) => activeView()!.layers[l.id] !== undefined) : [],
  );

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
      <Show
        when={availableViews().length > 0}
        fallback={
          <div style={{ padding: '24px', color: '#888' }}>
            No views available. Check that the graph declares a registered pack.
          </div>
        }
      >
        <ViewSwitcher
          views={availableViews()}
          activeViewId={activeView()?.id ?? ''}
          onChange={setActiveViewId}
        />
        <LayerToolbar canvasId={canvasId()} viewId={activeView()?.id ?? ''} layers={activeLayers()} />
        <LayoutToolbar handle={viewerHandle} algorithm={algorithm} onAlgorithmChange={setAlgorithm} />
        <Show when={activeView()}>
          {(view) => (
            <PgCanvasView
              graph={props.graph}
              view={view()}
              algorithm={algorithm()}
              ref={setViewerHandle}
            />
          )}
        </Show>
      </Show>
    </div>
  );
}
