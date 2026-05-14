import type { Layer } from '@luminous/canvas-core';
import { defaultLayerStateStore } from './layerState';

export function useLayerOpacity(
  canvasId: string,
  viewId: string,
  layers: readonly Layer[],
  edgeKind: string,
): () => number {
  const layer = layers.find(l => l.edgeKinds.includes(edgeKind));
  if (!layer) return () => 1;

  const stateAccessor = defaultLayerStateStore.getState(
    { canvasId, viewId, layerId: layer.id },
    layer.defaultState,
  );

  return () => {
    const state = stateAccessor();
    if (state === 'on') return 1.0;
    if (state === 'peek') return 0.2;
    return 0;
  };
}
