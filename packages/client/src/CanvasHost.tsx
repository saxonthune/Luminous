import { createSignal, createMemo, createEffect, Show } from 'solid-js';
import type { Graph, View, Layer, Pack } from '@luminous/core';
import {
  resolvePack,
  viewSwitcherSchema,
  layerToolbarSchema,
  layoutToolbarSchema,
  nodeContextMenuSchema,
  backgroundContextMenuSchema,
} from '@luminous/core';
import type { ChromeSchema } from '@luminous/core';
import { PgCanvasView, type ViewerHandle } from './PgCanvasView';

type LayoutAlgorithm = 'grid' | 'elk' | 'mrtree';

interface CanvasHostProps {
  graph: Graph;
  sourceId: string;
}

export function CanvasHost(props: CanvasHostProps) {
  // The active view declares a default layout (pack-level vocabulary). The
  // toolbar lets the user override at runtime; switching views re-applies the
  // new view's default.
  const [algorithm, setAlgorithm] = createSignal<LayoutAlgorithm>('elk');
  const [direction, setDirection] = createSignal<'RIGHT' | 'DOWN' | undefined>(undefined);
  // Transient ELK spacing multiplier — each "Space out" click bumps it; not persisted.
  const [spacing, setSpacing] = createSignal(1);
  const [viewerHandle, setViewerHandle] = createSignal<ViewerHandle | undefined>(undefined);
  const [enabledLayers, setEnabledLayers] = createSignal<Record<string, boolean>>({});

  const declaredPacks = createMemo<Pack[]>(() => {
    const p = props.graph.pack ? resolvePack(props.graph.pack) : undefined;
    return p ? [p] : [];
  });

  const availableViews = createMemo<View[]>(() => declaredPacks().flatMap((p) => p.views));
  const availableLayers = createMemo<Layer[]>(() => declaredPacks().flatMap((p) => p.layers));

  const [activeViewId, setActiveViewId] = createSignal<string>('');
  const activeView = createMemo<View | undefined>(
    () => availableViews().find((v) => v.id === activeViewId()) ?? availableViews()[0],
  );

  // Apply the active view's declared layout whenever the view changes. The
  // toolbar still calls setAlgorithm directly to override; that override sticks
  // until the user switches views again.
  createEffect(() => {
    const v = activeView();
    if (!v) return;
    const lay = v.layout;
    if (lay.algorithm === 'grid' || lay.algorithm === 'elk' || lay.algorithm === 'mrtree') {
      setAlgorithm(lay.algorithm);
    }
    if (lay.algorithm === 'elk' || lay.algorithm === 'mrtree') {
      setDirection(lay.direction);
    } else {
      setDirection(undefined);
    }
  });

  const chrome = createMemo<ChromeSchema>(() => {
    const view = activeView();
    if (!view) return {};
    const currentViewId = activeViewId() || (availableViews()[0]?.id ?? '');
    const layerTb = layerToolbarSchema(view, availableLayers(), enabledLayers());
    return {
      left: [viewSwitcherSchema(availableViews(), currentViewId)],
      top: layerTb.controls.length > 0 ? [layerTb] : [],
      right: [layoutToolbarSchema(algorithm(), ['grid', 'elk', 'mrtree'])],
    };
  });

  const dispatch = (id: string, payload?: unknown) => {
    const p = payload as Record<string, unknown>;
    switch (id) {
      case 'VIEW.SET':
        setActiveViewId(p['viewId'] as string);
        break;
      case 'LAYER.TOGGLE': {
        const layerId = p['layerId'] as string;
        setEnabledLayers((prev) => ({ ...prev, [layerId]: prev[layerId] === false }));
        break;
      }
      case 'LAYOUT.ZOOM_IN':
        viewerHandle()?.zoomIn();
        break;
      case 'LAYOUT.ZOOM_OUT':
        viewerHandle()?.zoomOut();
        break;
      case 'LAYOUT.FIT':
        viewerHandle()?.fitView();
        break;
      case 'LAYOUT.SET_ALGORITHM':
        setAlgorithm(p['algorithm'] as LayoutAlgorithm);
        break;
      case 'LAYOUT.SPACE_OUT':
        setSpacing((s) => Math.min(s + 0.5, 4));
        break;
    }
  };

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
      <Show
        when={availableViews().length > 0}
        fallback={
          <div style={{ padding: '24px', color: 'var(--fg-muted)' }}>
            No views available. Check that the graph declares a registered pack.
          </div>
        }
      >
        <Show when={activeView()}>
          {(view) => (
            <PgCanvasView
              graph={props.graph}
              view={view()}
              algorithm={algorithm()}
              direction={direction()}
              spacing={spacing()}
              ref={setViewerHandle}
              chrome={chrome()}
              onAction={dispatch}
              nodeContextMenu={(nodeId) => {
                const node = props.graph.nodes.get(nodeId);
                if (!node) return undefined;
                return nodeContextMenuSchema(node, []);
              }}
              backgroundContextMenu={backgroundContextMenuSchema}
            />
          )}
        </Show>
      </Show>
    </div>
  );
}
