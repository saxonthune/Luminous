import { createSignal } from 'solid-js';
import type { LayerState } from '@luminous/core';

export interface LayerStateKey {
  canvasId: string;
  viewId: string;
  layerId: string;
}

function storeKey(key: LayerStateKey): string {
  return `${key.canvasId}:${key.viewId}:${key.layerId}`;
}

function lsKey(key: LayerStateKey): string {
  return `luminous:layer-state:${key.canvasId}:${key.viewId}:${key.layerId}`;
}

function isLayerState(v: string | null): v is LayerState {
  return v === 'on' || v === 'peek' || v === 'off';
}

export function createLayerStateStore() {
  const [store, setStore] = createSignal<Map<string, LayerState>>(new Map());
  const initialized = new Set<string>();

  function getState(key: LayerStateKey, defaultState: LayerState): () => LayerState {
    const k = storeKey(key);

    if (!initialized.has(k)) {
      initialized.add(k);
      const saved = localStorage.getItem(lsKey(key));
      if (isLayerState(saved)) {
        setStore(prev => {
          const next = new Map(prev);
          next.set(k, saved);
          return next;
        });
      }
    }

    // eslint-disable-next-line solid/reactivity -- returns a getter for consumers to use in tracked scopes
    return () => store().get(k) ?? defaultState;
  }

  function setState(key: LayerStateKey, state: LayerState): void {
    const k = storeKey(key);
    localStorage.setItem(lsKey(key), state);
    setStore(prev => {
      const next = new Map(prev);
      next.set(k, state);
      return next;
    });
  }

  function resetView(canvasId: string, viewId: string): void {
    const prefix = `${canvasId}:${viewId}:`;
    const lsPrefix = `luminous:layer-state:${canvasId}:${viewId}:`;

    setStore(prev => {
      const next = new Map(prev);
      for (const k of next.keys()) {
        if (k.startsWith(prefix)) {
          next.delete(k);
          initialized.delete(k);
        }
      }
      return next;
    });

    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(lsPrefix)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  }

  return { getState, setState, resetView };
}

export const defaultLayerStateStore = createLayerStateStore();
