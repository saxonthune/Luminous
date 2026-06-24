/**
 * Pure unit test for PgCanvasView logic (evaluateView + gridLayout).
 *
 * No DOM rendering: @solidjs/testing-library is not in client-next's deps.
 * This test validates the data pipeline that PgCanvasView drives.
 * DOM nesting assertion skipped per plan fallback.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildGraph, evaluateView, registerPack, resetRegistry, getNodeKind, getPrimitivesBuiltin } from '@luminous/core';
import type { Node, Edge, View, Pack } from '@luminous/core';
import { gridLayout, resolveAbsolutePositionByParentOf } from '@luminous/cactus';
import { computeMatchGating, MATCH_GATING_CFG } from '../src/matchGating';

// ── Fixture ──────────────────────────────────────────────────────────────────

const REGION: Node    = { id: 'region',    kind: 'statechart.region',    props: {}, tags: [] };
const COMPOSITE: Node = { id: 'composite', kind: 'statechart.composite', props: {}, tags: [] };
const STATE: Node     = { id: 'state',     kind: 'statechart.state',     props: {}, tags: [] };

// substate-of: child → parent  (from=child, to=parent)
const EDGES: Edge[] = [
  { id: 'e1', kind: 'substate-of', from: 'composite', to: 'region',    props: {}, tags: [] },
  { id: 'e2', kind: 'substate-of', from: 'state',     to: 'composite', props: {}, tags: [] },
];

const graph = buildGraph([REGION, COMPOSITE, STATE], EDGES);

const view: View = {
  id: 'test-view',
  name: 'Test',
  nodeRoles: {
    'statechart.region':    'spatial',
    'statechart.composite': 'spatial',
    'statechart.state':     'spatial',
  },
  edgeRoles: {
    'substate-of': 'contain',
  },
  layers: {},
  layout: { algorithm: 'manual' },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PgCanvasView data pipeline', () => {
  it('evaluateView identifies all three nodes as spatial', () => {
    const scene = evaluateView(graph, view);
    const ids = scene.spatialNodes.map((n) => n.id).sort();
    expect(ids).toEqual(['composite', 'region', 'state']);
  });

  it('evaluateView resolves containment tree correctly', () => {
    const { containment } = evaluateView(graph, view);
    expect(containment.rootIds).toEqual(['region']);
    expect(containment.childrenOf.get('region')).toEqual(['composite']);
    expect(containment.childrenOf.get('composite')).toEqual(['state']);
    expect(containment.parentOf.get('composite')).toBe('region');
    expect(containment.parentOf.get('state')).toBe('composite');
  });

  it('gridLayout sizes grow monotonically with nesting depth', () => {
    const { containment } = evaluateView(graph, view);
    const { sizes } = gridLayout({
      rootIds: containment.rootIds,
      childrenOf: containment.childrenOf,
      edges: [],
    });
    const stateSize     = sizes.get('state')!;
    const compositeSize = sizes.get('composite')!;
    const regionSize    = sizes.get('region')!;
    expect(compositeSize.w).toBeGreaterThan(stateSize.w);
    expect(regionSize.w).toBeGreaterThan(compositeSize.w);
  });

  it('absolute positions accumulate correctly for three-level nesting', () => {
    const { containment } = evaluateView(graph, view);
    const { positions } = gridLayout({
      rootIds: containment.rootIds,
      childrenOf: containment.childrenOf,
      edges: [],
    });

    const regionAbs    = resolveAbsolutePositionByParentOf('region',    positions, containment.parentOf);
    const compositeAbs = resolveAbsolutePositionByParentOf('composite', positions, containment.parentOf);
    const stateAbs     = resolveAbsolutePositionByParentOf('state',     positions, containment.parentOf);

    // region is a root → absolute = its own position
    expect(regionAbs).toEqual(positions.get('region'));

    // composite absolute > region absolute (it's inset)
    expect(compositeAbs.x).toBeGreaterThanOrEqual(regionAbs.x);
    expect(compositeAbs.y).toBeGreaterThanOrEqual(regionAbs.y);

    // state absolute > composite absolute
    expect(stateAbs.x).toBeGreaterThanOrEqual(compositeAbs.x);
    expect(stateAbs.y).toBeGreaterThanOrEqual(compositeAbs.y);
  });

  it('BFS render order has parents before children', () => {
    const { containment } = evaluateView(graph, view);

    // Replicate the BFS from PgCanvasView
    const order: string[] = [];
    const queue: string[] = [...containment.rootIds];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      const children = containment.childrenOf.get(id) ?? [];
      queue.push(...children);
    }

    expect(order.indexOf('region')).toBeLessThan(order.indexOf('composite'));
    expect(order.indexOf('composite')).toBeLessThan(order.indexOf('state'));
  });
});

// ── Peek-set wiring via match-gating ─────────────────────────────────────────

describe('evaluateView peek-set wiring (match-gating)', () => {
  const MATCH: Node = {
    id: 'match_node',
    kind: 'rust.match',
    props: { label: 'x', arms: ['A', 'B'], selectedArm: 'A' },
    tags: [],
  };
  const NODE_A: Node = { id: 'node_a', kind: 'prim.box', props: { label: 'a' }, tags: [] };
  const NODE_B: Node = { id: 'node_b', kind: 'prim.box', props: { label: 'b' }, tags: [] };

  const EDGES: Edge[] = [
    { id: 'e_a', kind: 'rust.dataflow', from: 'match_node', to: 'node_a', props: { arm: 'A' }, tags: [] },
    { id: 'e_b', kind: 'rust.dataflow', from: 'match_node', to: 'node_b', props: { arm: 'B' }, tags: [] },
  ];

  const gatingGraph = buildGraph([MATCH, NODE_A, NODE_B], EDGES);

  it('scene receives peek set — node_b is peeked when selectedArm=A, layer=peek', () => {
    const view: View = {
      id: 'v',
      name: 'V',
      nodeRoles: { 'rust.match': 'spatial', 'prim.box': 'spatial' },
      edgeRoles: { 'rust.dataflow': 'arrow' },
      layers: { 'match-gating': 'peek' },
      layout: { algorithm: 'manual' },
    };
    const peek = computeMatchGating(gatingGraph, view, MATCH_GATING_CFG);
    const scene = evaluateView(gatingGraph, view, { peek });

    const peekIds = scene.peekNodes.map((n) => n.id);
    expect(peekIds).toContain('node_b');
    expect(peekIds).not.toContain('node_a');
    expect(peekIds).not.toContain('match_node');
  });

  it('scene has no peek nodes when match-gating layer is off', () => {
    const view: View = {
      id: 'v',
      name: 'V',
      nodeRoles: { 'rust.match': 'spatial', 'prim.box': 'spatial' },
      edgeRoles: { 'rust.dataflow': 'arrow' },
      layers: {},
      layout: { algorithm: 'manual' },
    };
    const peek = computeMatchGating(gatingGraph, view, MATCH_GATING_CFG);
    const scene = evaluateView(gatingGraph, view, { peek });
    expect(scene.peekNodes).toHaveLength(0);
  });
});

// ── Declarative render JSON via pack ─────────────────────────────────────────

const dummySchema = {
  parse: (x: unknown) => x,
  safeParse: (x: unknown) => ({ success: true as const, data: x }),
};

describe('declarative render JSON on node kinds', () => {
  beforeEach(() => {
    resetRegistry();
  });
  afterEach(() => {
    resetRegistry();
  });

  it('prim.box kind has render JSON after registering primitives pack', () => {
    registerPack(getPrimitivesBuiltin());
    const kind = getNodeKind('prim.box');
    expect(kind?.render).toBeDefined();
    expect(kind?.render?.card).toBeDefined();
  });

  it('a kind with render JSON has it accessible via getNodeKind', () => {
    const testPack: Pack = {
      id: 'test-declarative',
      version: '0.0.1',
      nodeKinds: [{
        id: 'test.decl',
        label: 'Decl',
        propsSchema: dummySchema,
        idDerivation: () => 'n',
        render: { card: { type: 'text', value: 'hello', style: 'body' } },
      }],
      edgeKinds: [],
      views: [],
      layers: [],
      disclosureSchemas: [],
    };
    registerPack(testPack);
    const kind = getNodeKind('test.decl');
    expect(kind?.render?.card).toEqual({ type: 'text', value: 'hello', style: 'body' });
  });
});
