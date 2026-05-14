import { describe, it, expect } from 'vitest';
import { buildGraph, evaluateContainment } from '../src/graph.ts';
import type { Node, Edge, View } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Fixture: 3-deep RTP statechart hierarchy
//
// Region "nav" contains composite "CollectionDetail"
// which contains states "mapProjection" and "listProjection".
// Plus a flat region "overlay" with a single leaf "none".
// substate-of edges point from child to parent (RTP convention).
// ---------------------------------------------------------------------------

const nodes: Node[] = [
  { id: 'nav',              kind: 'statechart.region',    props: {}, tags: [] },
  { id: 'CollectionDetail', kind: 'statechart.composite', props: {}, tags: [] },
  { id: 'mapProjection',    kind: 'statechart.state',     props: {}, tags: [] },
  { id: 'listProjection',   kind: 'statechart.state',     props: {}, tags: [] },
  { id: 'overlay',          kind: 'statechart.region',    props: {}, tags: [] },
  { id: 'none',             kind: 'statechart.state',     props: {}, tags: [] },
];

const edges: Edge[] = [
  // CollectionDetail is substate of nav
  { id: 'e1', kind: 'statechart.substate-of', from: 'CollectionDetail', to: 'nav',              props: {}, tags: [] },
  // mapProjection is substate of CollectionDetail
  { id: 'e2', kind: 'statechart.substate-of', from: 'mapProjection',    to: 'CollectionDetail', props: {}, tags: [] },
  // listProjection is substate of CollectionDetail
  { id: 'e3', kind: 'statechart.substate-of', from: 'listProjection',   to: 'CollectionDetail', props: {}, tags: [] },
  // none is substate of overlay
  { id: 'e4', kind: 'statechart.substate-of', from: 'none',             to: 'overlay',          props: {}, tags: [] },
];

const spatialView: View = {
  id: 'statechart-view',
  name: 'Statechart',
  nodeRoles: {
    'statechart.region':    'spatial',
    'statechart.composite': 'spatial',
    'statechart.state':     'spatial',
  },
  edgeRoles: {
    'statechart.substate-of': 'contain',
  },
  layers: {},
  layout: { algorithm: 'manual' },
};

// ---------------------------------------------------------------------------
// buildGraph
// ---------------------------------------------------------------------------

describe('buildGraph', () => {
  it('builds maps and indices for a simple graph', () => {
    const g = buildGraph(
      [nodes[0], nodes[1]],
      [edges[0]],
    );

    expect(g.nodes.size).toBe(2);
    expect(g.edges.size).toBe(1);
    expect(g.nodes.get('nav')).toBeDefined();
    expect(g.nodes.get('CollectionDetail')).toBeDefined();
    expect(g.edges.get('e1')).toBeDefined();

    expect(g.edgesByKind.get('statechart.substate-of')?.has('e1')).toBe(true);
    expect(g.outgoing.get('CollectionDetail')?.has('e1')).toBe(true);
    expect(g.incoming.get('nav')?.has('e1')).toBe(true);
    expect(g.outgoing.get('nav')?.size).toBe(0);
    expect(g.incoming.get('CollectionDetail')?.size).toBe(0);
  });

  it('throws on duplicate node id', () => {
    const dupeNode: Node = { id: 'nav', kind: 'statechart.region', props: {}, tags: [] };
    expect(() => buildGraph([nodes[0], dupeNode], [])).toThrow('buildGraph: duplicate node id nav');
  });

  it('throws on duplicate edge id', () => {
    const dupeEdge: Edge = { id: 'e1', kind: 'statechart.substate-of', from: 'CollectionDetail', to: 'nav', props: {}, tags: [] };
    expect(() => buildGraph([nodes[0], nodes[1]], [edges[0], dupeEdge])).toThrow('buildGraph: duplicate edge id e1');
  });

  it('throws on edge with missing from node', () => {
    const badEdge: Edge = { id: 'ex', kind: 'statechart.substate-of', from: 'ghost', to: 'nav', props: {}, tags: [] };
    expect(() => buildGraph([nodes[0]], [badEdge])).toThrow('buildGraph: edge ex references missing node ghost');
  });

  it('throws on edge with missing to node', () => {
    const badEdge: Edge = { id: 'ex', kind: 'statechart.substate-of', from: 'nav', to: 'ghost', props: {}, tags: [] };
    expect(() => buildGraph([nodes[0]], [badEdge])).toThrow('buildGraph: edge ex references missing node ghost');
  });

  it('outgoing and incoming contain empty sets for nodes with no edges', () => {
    const g = buildGraph([nodes[0]], []);
    expect(g.outgoing.get('nav')).toBeDefined();
    expect(g.outgoing.get('nav')?.size).toBe(0);
    expect(g.incoming.get('nav')).toBeDefined();
    expect(g.incoming.get('nav')?.size).toBe(0);
  });

  it('edgesByKind groups multiple edges of the same kind into one set', () => {
    const g = buildGraph(nodes, edges);
    const kindSet = g.edgesByKind.get('statechart.substate-of');
    expect(kindSet?.size).toBe(4);
    expect(kindSet?.has('e1')).toBe(true);
    expect(kindSet?.has('e4')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluateContainment
// ---------------------------------------------------------------------------

describe('evaluateContainment', () => {
  it('3-deep nesting: returns correct tree', () => {
    const g = buildGraph(nodes, edges);
    const tree = evaluateContainment(g, spatialView);

    expect(tree.rootIds).toContain('nav');
    expect(tree.rootIds).toContain('overlay');
    expect(tree.rootIds).not.toContain('CollectionDetail');
    expect(tree.rootIds).not.toContain('mapProjection');

    expect(tree.childrenOf.get('nav')).toEqual(['CollectionDetail']);
    expect(tree.childrenOf.get('CollectionDetail')).toEqual(['mapProjection', 'listProjection']);
    expect(tree.childrenOf.get('overlay')).toEqual(['none']);

    expect(tree.parentOf.get('CollectionDetail')).toBe('nav');
    expect(tree.parentOf.get('mapProjection')).toBe('CollectionDetail');
    expect(tree.parentOf.get('listProjection')).toBe('CollectionDetail');
    expect(tree.parentOf.get('none')).toBe('overlay');

    expect(tree.warnings).toHaveLength(0);
  });

  it('view with zero contain-role edges returns flat tree', () => {
    const flatView: View = {
      ...spatialView,
      id: 'flat-view',
      edgeRoles: { 'statechart.substate-of': 'arrow' },
    };
    const g = buildGraph(nodes, edges);
    const tree = evaluateContainment(g, flatView);

    expect(tree.rootIds).toHaveLength(nodes.length);
    expect(tree.childrenOf.size).toBe(0);
    expect(tree.parentOf.size).toBe(0);
    expect(tree.warnings).toHaveLength(0);
  });

  it('view with two contain-role edge kinds throws', () => {
    const twoContainView: View = {
      ...spatialView,
      id: 'two-contain-view',
      edgeRoles: {
        'statechart.substate-of': 'contain',
        'statechart.also-contain': 'contain',
      },
    };
    const g = buildGraph(nodes, edges);
    expect(() => evaluateContainment(g, twoContainView)).toThrow(
      'evaluateContainment: view "two-contain-view" has multiple contain-role edge kinds'
    );
  });

  it('multiple parents: keeps first-encountered parent and emits warning', () => {
    const twoParentNodes: Node[] = [
      { id: 'parent1', kind: 'statechart.region',    props: {}, tags: [] },
      { id: 'parent2', kind: 'statechart.region',    props: {}, tags: [] },
      { id: 'child',   kind: 'statechart.state',     props: {}, tags: [] },
    ];
    const twoParentEdges: Edge[] = [
      { id: 'ep1', kind: 'statechart.substate-of', from: 'child', to: 'parent1', props: {}, tags: [] },
      { id: 'ep2', kind: 'statechart.substate-of', from: 'child', to: 'parent2', props: {}, tags: [] },
    ];
    const g = buildGraph(twoParentNodes, twoParentEdges);
    const tree = evaluateContainment(g, spatialView);

    expect(tree.parentOf.get('child')).toBe('parent1');
    expect(tree.warnings).toHaveLength(1);
    expect(tree.warnings[0].code).toBe('multiple-parents');
    expect(tree.warnings[0].nodeId).toBe('child');
    expect(tree.warnings[0].message).toContain('parent2');
  });

  it('cycle throws with cycle path in message', () => {
    const cycleNodes: Node[] = [
      { id: 'A', kind: 'statechart.state', props: {}, tags: [] },
      { id: 'B', kind: 'statechart.state', props: {}, tags: [] },
      { id: 'C', kind: 'statechart.state', props: {}, tags: [] },
    ];
    const cycleEdges: Edge[] = [
      { id: 'eAB', kind: 'statechart.substate-of', from: 'A', to: 'B', props: {}, tags: [] },
      { id: 'eBC', kind: 'statechart.substate-of', from: 'B', to: 'C', props: {}, tags: [] },
      { id: 'eCA', kind: 'statechart.substate-of', from: 'C', to: 'A', props: {}, tags: [] },
    ];
    const g = buildGraph(cycleNodes, cycleEdges);
    expect(() => evaluateContainment(g, spatialView)).toThrow(
      'evaluateContainment: cycle in containment graph:'
    );
  });

  it('latent and hidden nodes are excluded from roots', () => {
    const mixedView: View = {
      ...spatialView,
      id: 'mixed-view',
      nodeRoles: {
        'statechart.region':    'spatial',
        'statechart.composite': 'latent',
        'statechart.state':     'hidden',
      },
      edgeRoles: {},
    };
    const g = buildGraph(nodes, edges);
    const tree = evaluateContainment(g, mixedView);

    // only spatial kinds (region) should appear as roots
    expect(tree.rootIds).toContain('nav');
    expect(tree.rootIds).toContain('overlay');
    expect(tree.rootIds).not.toContain('CollectionDetail'); // latent
    expect(tree.rootIds).not.toContain('mapProjection');    // hidden
    expect(tree.rootIds).not.toContain('none');             // hidden
  });
});
