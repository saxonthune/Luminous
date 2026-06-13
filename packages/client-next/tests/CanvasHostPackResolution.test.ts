/**
 * Test: CanvasHost resolves views and layers from the pack registry
 * based on graph.pack, not from a hard-coded pack import.
 *
 * Pure data-layer test — no DOM rendering required.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerPack, resetRegistry, resolvePack } from '@luminous/core';
import { buildGraph } from '@luminous/core';
import type { Pack, Node, Edge, View } from '@luminous/core';

// ── Minimal test pack ─────────────────────────────────────────────────────────

const testView: View = {
  id: 'test.my-view',
  name: 'My View',
  nodeRoles: {},
  edgeRoles: {},
  layers: {},
  layout: { algorithm: 'manual' },
};

const testView2: View = {
  id: 'test.second-view',
  name: 'Second View',
  nodeRoles: {},
  edgeRoles: {},
  layers: {},
  layout: { algorithm: 'manual' },
};

const dummySchema = { parse: (x: unknown) => x, safeParse: (x: unknown) => ({ success: true as const, data: x }) };

const syntheticPack: Pack = {
  id: 'test-synthetic-pack',
  version: '1.0.0',
  nodeKinds: [{ id: 'test.node', label: 'Node', propsSchema: dummySchema, idDerivation: () => 'n' }],
  edgeKinds: [],
  disclosureSchemas: [],
  layers: [{ id: 'test-layer', name: 'Test Layer', edgeKinds: [], defaultState: 'on' }],
  views: [testView, testView2],
};

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  resetRegistry();
  registerPack(syntheticPack);
});

afterEach(() => {
  resetRegistry();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Pack resolution from graph.pack', () => {
  it('resolvePack returns the registered pack for the declared id', () => {
    const pack = resolvePack('test-synthetic-pack');
    expect(pack).toBeDefined();
    expect(pack!.views.length).toBe(2);
    expect(pack!.views[0].id).toBe('test.my-view');
  });

  it('graph built with the pack id carries pack field', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const graph = buildGraph(nodes, edges, 'test-synthetic-pack');
    expect(graph.pack).toBe('test-synthetic-pack');
  });

  it('resolves views by looking up graph.pack through registry', () => {
    const graph = buildGraph([], [], 'test-synthetic-pack');

    // Simulate what CanvasHost does: resolve the single pack
    const p = graph.pack ? resolvePack(graph.pack) : undefined;
    const declaredPacks = p ? [p] : [];

    const availableViews = declaredPacks.flatMap((p) => p.views);
    expect(availableViews.length).toBe(2);
    expect(availableViews.map((v) => v.id)).toContain('test.my-view');
    expect(availableViews.map((v) => v.id)).toContain('test.second-view');
  });

  it('resolves layers by looking up graph.pack through registry', () => {
    const graph = buildGraph([], [], 'test-synthetic-pack');

    const p = graph.pack ? resolvePack(graph.pack) : undefined;
    const declaredPacks = p ? [p] : [];

    const availableLayers = declaredPacks.flatMap((p) => p.layers);
    expect(availableLayers.length).toBe(1);
    expect(availableLayers[0].id).toBe('test-layer');
  });

  it('returns empty views when graph declares no pack', () => {
    const graph = buildGraph([], [], '');
    const p = graph.pack ? resolvePack(graph.pack) : undefined;
    const declaredPacks = p ? [p] : [];
    expect(declaredPacks).toHaveLength(0);
  });

  it('returns empty views when pack is not registered', () => {
    const graph = buildGraph([], [], 'unknown-pack');
    const p = graph.pack ? resolvePack(graph.pack) : undefined;
    const declaredPacks = p ? [p] : [];
    expect(declaredPacks).toHaveLength(0);
  });
});
