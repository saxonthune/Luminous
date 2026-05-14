import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createLayerStateStore } from '../layerState';

beforeEach(() => {
  localStorage.clear();
});

describe('layerState', () => {
  it('setState then getState returns the new value', () => {
    createRoot(dispose => {
      const store = createLayerStateStore();
      const key = { canvasId: 'c1', viewId: 'v1', layerId: 'l1' };
      store.setState(key, 'peek');
      expect(store.getState(key, 'on')()).toBe('peek');
      dispose();
    });
  });

  it('localStorage round-trip: set, create new store, get returns persisted value', () => {
    createRoot(dispose => {
      const store1 = createLayerStateStore();
      const key = { canvasId: 'c2', viewId: 'v1', layerId: 'l1' };
      store1.setState(key, 'off');

      const store2 = createLayerStateStore();
      expect(store2.getState(key, 'on')()).toBe('off');
      dispose();
    });
  });

  it('resetView clears entries for that view but not sibling views', () => {
    createRoot(dispose => {
      const store = createLayerStateStore();
      const key1 = { canvasId: 'c3', viewId: 'v1', layerId: 'l1' };
      const key2 = { canvasId: 'c3', viewId: 'v2', layerId: 'l1' };

      store.setState(key1, 'peek');
      store.setState(key2, 'off');

      store.resetView('c3', 'v1');

      expect(store.getState(key1, 'on')()).toBe('on');
      expect(store.getState(key2, 'on')()).toBe('off');
      dispose();
    });
  });
});
