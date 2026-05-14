import { createSignal, createMemo } from 'solid-js';
import type { Graph, View } from '@luminous/canvas-core';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';
import { PgCanvasView, type ViewerHandle } from './PgCanvasView';
import { ViewSwitcher } from './views/ViewSwitcher';
import { LayerToolbar } from './layers/LayerToolbar';
import { LayoutToolbar, type LayoutAlgorithm } from './toolbar/LayoutToolbar';

interface CanvasHostProps {
  graph: Graph;
  sourceId: string;
}

export function CanvasHost(props: CanvasHostProps) {
  const [activeViewId, setActiveViewId] = createSignal<string>(rtpStatechartPack.views[0].id);
  const [algorithm, setAlgorithm] = createSignal<LayoutAlgorithm>('grid');
  const [viewerHandle, setViewerHandle] = createSignal<ViewerHandle | undefined>(undefined);

  const canvasId = createMemo(
    () => props.sourceId.split('/').pop()?.replace(/\.canvas\.json$/, '') ?? props.sourceId,
  );

  const activeView = createMemo<View>(
    () => rtpStatechartPack.views.find((v) => v.id === activeViewId()) ?? rtpStatechartPack.views[0],
  );

  const activeLayers = createMemo(() =>
    rtpStatechartPack.layers.filter((l) => l.id in activeView().layers),
  );

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
      <ViewSwitcher
        views={rtpStatechartPack.views}
        activeViewId={activeViewId()}
        onChange={setActiveViewId}
      />
      <LayerToolbar canvasId={canvasId()} viewId={activeViewId()} layers={activeLayers()} />
      <LayoutToolbar handle={viewerHandle} algorithm={algorithm} onAlgorithmChange={setAlgorithm} />
      <PgCanvasView
        graph={props.graph}
        view={activeView()}
        algorithm={algorithm()}
        ref={setViewerHandle}
      />
    </div>
  );
}
