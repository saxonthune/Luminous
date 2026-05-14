import { For } from 'solid-js';
import type { Layer, LayerState } from '@luminous/core';
import { defaultLayerStateStore } from './layerState';

export interface LayerToolbarProps {
  canvasId: string;
  viewId: string;
  layers: readonly Layer[];
}

const STATES: LayerState[] = ['on', 'peek', 'off'];

export function LayerToolbar(props: LayerToolbarProps) {
  return (
    <div style={{
      position: 'absolute',
      top: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'white',
      border: '1px solid #d0d0d0',
      'border-radius': '6px',
      padding: '6px 10px',
      'z-index': '5',
      display: 'flex',
      gap: '12px',
      'align-items': 'center',
    }}>
      <For each={props.layers}>
        {(layer) => {
          const currentState = defaultLayerStateStore.getState(
            { canvasId: props.canvasId, viewId: props.viewId, layerId: layer.id },
            layer.defaultState,
          );
          return (
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              <span style={{ 'font-size': '12px', 'white-space': 'nowrap' }}>{layer.name}</span>
              <div style={{
                display: 'flex',
                border: '1px solid #d0d0d0',
                'border-radius': '4px',
                overflow: 'hidden',
              }}>
                <For each={STATES}>
                  {(state, i) => (
                    <button
                      data-active={currentState() === state}
                      style={{
                        padding: '2px 8px',
                        'font-size': '11px',
                        cursor: 'pointer',
                        border: 'none',
                        'border-right': i() < STATES.length - 1 ? '1px solid #d0d0d0' : 'none',
                        background: currentState() === state ? '#e0e7ff' : 'transparent',
                        'font-weight': currentState() === state ? '600' : '400',
                      }}
                      onClick={() => defaultLayerStateStore.setState(
                        { canvasId: props.canvasId, viewId: props.viewId, layerId: layer.id },
                        state,
                      )}
                    >
                      {state}
                    </button>
                  )}
                </For>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
