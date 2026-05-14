import type { MenuSchema, ToolbarSchema } from '@luminous/cactus/chrome-types';
import type { View, Layer, Node } from '../types.js';

export function viewSwitcherSchema(
  views: readonly View[],
  activeViewId: string,
): ToolbarSchema {
  return {
    id: 'view-switcher',
    controls: [
      {
        type: 'toggle-group',
        actions: views.map((v) => ({
          id: 'VIEW.SET',
          label: v.name,
          selected: v.id === activeViewId,
          payload: { viewId: v.id },
        })),
      },
    ],
  };
}

export function layerToolbarSchema(
  view: View,
  layers: readonly Layer[],
  enabledLayers: Record<string, boolean>,
): ToolbarSchema {
  const viewLayers = layers.filter((l) => view.layers[l.id] !== undefined);
  return {
    id: 'layer-toolbar',
    controls:
      viewLayers.length === 0
        ? []
        : [
            {
              type: 'toggle-set',
              actions: viewLayers.map((l) => ({
                id: 'LAYER.TOGGLE',
                label: l.name,
                selected: enabledLayers[l.id] !== false,
                payload: { layerId: l.id },
              })),
            },
          ],
  };
}

export function layoutToolbarSchema(
  algorithm: 'grid' | 'elk',
  availableAlgorithms: Array<'grid' | 'elk'>,
): ToolbarSchema {
  return {
    id: 'layout-toolbar',
    controls: [
      { type: 'button', action: { id: 'LAYOUT.ZOOM_OUT', label: '−', hotkey: 'Mod+-' } },
      { type: 'button', action: { id: 'LAYOUT.ZOOM_IN', label: '+', hotkey: 'Mod+=' } },
      { type: 'button', action: { id: 'LAYOUT.FIT', label: 'Fit', hotkey: 'Mod+Shift+F' } },
      { type: 'separator' },
      {
        type: 'toggle-group',
        actions: availableAlgorithms.map((a) => ({
          id: 'LAYOUT.SET_ALGORITHM',
          label: a,
          selected: a === algorithm,
          payload: { algorithm: a },
        })),
      },
    ],
  };
}

export function nodeContextMenuSchema(
  node: Node,
  _selection: string[],
): MenuSchema | undefined {
  return {
    id: `node-context-${node.id}`,
    items: [
      {
        type: 'action',
        action: { id: 'NODE.INSPECT', label: 'Inspect', payload: { nodeId: node.id } },
      },
    ],
  };
}

export function backgroundContextMenuSchema(): MenuSchema | undefined {
  return undefined;
}
