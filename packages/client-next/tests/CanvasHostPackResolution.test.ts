/**
 * Test: CanvasHost resolves views and layers from the pack registry
 * based on graph.packs[], not from a hard-coded pack import.
 *
 * Pure data-layer test — no DOM rendering required.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerPack, resetRegistry, getPack } from '@luminous/core';
import { buildGraph } from '@luminous/core';
import type { Pack, Node, Edge, View } from '@luminous/core';
import { z } from 'zod';

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
  nodeRenderers: {},
  edgeRenderers: {},
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

describe('Pack resolution from graph.packs', () => {
  it('getPack returns the registered pack for the declared id', () => {
    const pack = getPack('test-synthetic-pack');
    expect(pack).toBeDefined();
    expect(pack!.views.length).toBe(2);
    expect(pack!.views[0].id).toBe('test.my-view');
  });

  it('graph built with the pack id in packs record carries packs field', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const graph = buildGraph(nodes, edges, { 'test-synthetic-pack': '^1.0.0' });
    expect(graph.packs['test-synthetic-pack']).toBe('^1.0.0');
  });

  it('resolves views by iterating graph.packs keys through registry', () => {
    const graph = buildGraph([], [], { 'test-synthetic-pack': '^1.0.0' });

    // Simulate what CanvasHost does: Object.keys(graph.packs).map(id => getPack(id))
    const declaredPacks = Object.keys(graph.packs)
      .map((id) => getPack(id))
      .filter((p): p is Pack => Boolean(p));

    const availableViews = declaredPacks.flatMap((p) => p.views);
    expect(availableViews.length).toBe(2);
    expect(availableViews.map((v) => v.id)).toContain('test.my-view');
    expect(availableViews.map((v) => v.id)).toContain('test.second-view');
  });

  it('resolves layers by iterating graph.packs keys through registry', () => {
    const graph = buildGraph([], [], { 'test-synthetic-pack': '^1.0.0' });

    const declaredPacks = Object.keys(graph.packs)
      .map((id) => getPack(id))
      .filter((p): p is Pack => Boolean(p));

    const availableLayers = declaredPacks.flatMap((p) => p.layers);
    expect(availableLayers.length).toBe(1);
    expect(availableLayers[0].id).toBe('test-layer');
  });

  it('returns empty views when graph declares no packs', () => {
    const graph = buildGraph([], [], {});
    const declaredPacks = Object.keys(graph.packs)
      .map((id) => getPack(id))
      .filter((p): p is Pack => Boolean(p));
    expect(declaredPacks).toHaveLength(0);
  });

  it('skips packs not registered (unknown pack id)', () => {
    const graph = buildGraph([], [], { 'unknown-pack': '^9.0.0' });
    const declaredPacks = Object.keys(graph.packs)
      .map((id) => getPack(id))
      .filter((p): p is Pack => Boolean(p));
    expect(declaredPacks).toHaveLength(0);
  });
});
