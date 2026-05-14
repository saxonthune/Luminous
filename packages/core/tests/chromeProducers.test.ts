import { describe, it, expect } from 'vitest';
import {
  viewSwitcherSchema,
  layerToolbarSchema,
  layoutToolbarSchema,
  nodeContextMenuSchema,
  backgroundContextMenuSchema,
} from '../src/chrome/producers';
import type { View, Layer, Node } from '../src/types';

function makeView(id: string, name: string, layerIds: string[] = []): View {
  return {
    id,
    name,
    nodeRoles: {},
    edgeRoles: {},
    layers: Object.fromEntries(layerIds.map((lid) => [lid, 'on'])) as Record<string, import('../src/types').LayerState>,
    layout: { algorithm: 'manual' },
  };
}

function makeLayer(id: string, name: string): Layer {
  return { id, name, edgeKinds: [], defaultState: 'on' };
}

function makeNode(id: string, kind = 'test.kind'): Node {
  return { id, kind, props: {}, tags: [] };
}

// --- viewSwitcherSchema ---

describe('viewSwitcherSchema', () => {
  it('creates a toggle-group with one action per view', () => {
    const views = [makeView('v1', 'Concepts'), makeView('v2', 'Relations')];
    const result = viewSwitcherSchema(views, 'v1');

    expect(result.id).toBe('view-switcher');
    expect(result.controls).toHaveLength(1);
    const ctrl = result.controls[0]!;
    expect(ctrl.type).toBe('toggle-group');
    if (ctrl.type === 'toggle-group') {
      expect(ctrl.actions).toHaveLength(2);
      expect(ctrl.actions[0]!.selected).toBe(true);
      expect(ctrl.actions[1]!.selected).toBe(false);
      expect(ctrl.actions[0]!.payload).toEqual({ viewId: 'v1' });
      expect(ctrl.actions[0]!.id).toBe('VIEW.SET');
    }
  });

  it('handles empty views array', () => {
    const result = viewSwitcherSchema([], 'v1');
    const ctrl = result.controls[0]!;
    expect(ctrl.type).toBe('toggle-group');
    if (ctrl.type === 'toggle-group') {
      expect(ctrl.actions).toHaveLength(0);
    }
  });
});

// --- layerToolbarSchema ---

describe('layerToolbarSchema', () => {
  it('creates a toggle-set for layers present in the view', () => {
    const view = makeView('v1', 'Test', ['l1', 'l2']);
    const layers = [makeLayer('l1', 'Layer 1'), makeLayer('l2', 'Layer 2'), makeLayer('l3', 'Layer 3')];
    const result = layerToolbarSchema(view, layers, {});

    expect(result.controls).toHaveLength(1);
    const ctrl = result.controls[0]!;
    expect(ctrl.type).toBe('toggle-set');
    if (ctrl.type === 'toggle-set') {
      expect(ctrl.actions).toHaveLength(2); // only l1 and l2 (l3 not in view)
      expect(ctrl.actions[0]!.id).toBe('LAYER.TOGGLE');
      expect(ctrl.actions[0]!.selected).toBe(true); // enabled by default
      expect(ctrl.actions[0]!.payload).toEqual({ layerId: 'l1' });
    }
  });

  it('marks explicitly disabled layers as not selected', () => {
    const view = makeView('v1', 'Test', ['l1']);
    const layers = [makeLayer('l1', 'Layer 1')];
    const result = layerToolbarSchema(view, layers, { l1: false });

    const ctrl = result.controls[0]!;
    if (ctrl.type === 'toggle-set') {
      expect(ctrl.actions[0]!.selected).toBe(false);
    }
  });

  it('returns empty controls when view has no layers', () => {
    const view = makeView('v1', 'Test', []);
    const layers = [makeLayer('l1', 'Layer 1')];
    const result = layerToolbarSchema(view, layers, {});
    expect(result.controls).toHaveLength(0);
  });
});

// --- layoutToolbarSchema ---

describe('layoutToolbarSchema', () => {
  it('creates zoom buttons, separator, and algorithm toggle-group', () => {
    const result = layoutToolbarSchema('grid', ['grid', 'elk']);

    const types = result.controls.map((c) => c.type);
    expect(types).toContain('button');
    expect(types).toContain('separator');
    expect(types).toContain('toggle-group');

    const buttons = result.controls.filter((c) => c.type === 'button');
    expect(buttons).toHaveLength(3); // ZOOM_OUT, ZOOM_IN, FIT
  });

  it('marks the active algorithm as selected', () => {
    const result = layoutToolbarSchema('elk', ['grid', 'elk']);
    const algoCtrl = result.controls.find((c) => c.type === 'toggle-group');
    if (algoCtrl?.type === 'toggle-group') {
      const elkAction = algoCtrl.actions.find((a) => a.payload && (a.payload as Record<string, unknown>)['algorithm'] === 'elk');
      expect(elkAction?.selected).toBe(true);
      const gridAction = algoCtrl.actions.find((a) => a.payload && (a.payload as Record<string, unknown>)['algorithm'] === 'grid');
      expect(gridAction?.selected).toBe(false);
    }
  });
});

// --- nodeContextMenuSchema ---

describe('nodeContextMenuSchema', () => {
  it('returns a menu with an Inspect action', () => {
    const node = makeNode('n1');
    const result = nodeContextMenuSchema(node, []);

    expect(result).not.toBeUndefined();
    expect(result!.items).toHaveLength(1);
    const item = result!.items[0]!;
    expect(item.type).toBe('action');
    if (item.type === 'action') {
      expect(item.action.id).toBe('NODE.INSPECT');
      expect(item.action.payload).toEqual({ nodeId: 'n1' });
    }
  });
});

// --- backgroundContextMenuSchema ---

describe('backgroundContextMenuSchema', () => {
  it('returns undefined (no default background actions in v1)', () => {
    expect(backgroundContextMenuSchema()).toBeUndefined();
  });
});
