import { describe, it, expect } from 'vitest';
import { buildGraph, evaluateView } from '../src/index.ts';
import type { Node, Edge, View } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Fixture: RTP architecture graph
//
// Nodes:
//   region.nav, region.overlay (statechart.region)
//   composite.CollectionDetail (statechart.composite) — child of region.nav
//   state.mapProjection, state.listProjection (statechart.state) — children of composite
//   state.MapOverview (statechart.state) — child of region.nav
//   concept.Collection (rtp.concept)
//   action.Collection.create (rtp.action)
//   transition.MapOverview.TAP_PIN (statechart.transition)
//
// Edges:
//   substate-of: child → parent (contain semantics in statechart view)
//   transition: state → state (arrow in statechart view)
//   belongs-to-concept: action → concept (contain in concept-map view)
//   invokes-action: transition → action (summary in statechart view)
// ---------------------------------------------------------------------------

const nodes: Node[] = [
  { id: 'region.nav',                    kind: 'statechart.region',     props: {}, tags: [] },
  { id: 'region.overlay',                kind: 'statechart.region',     props: {}, tags: [] },
  { id: 'composite.CollectionDetail',    kind: 'statechart.composite',  props: {}, tags: [] },
  { id: 'state.mapProjection',           kind: 'statechart.state',      props: {}, tags: [] },
  { id: 'state.listProjection',          kind: 'statechart.state',      props: {}, tags: [] },
  { id: 'state.MapOverview',             kind: 'statechart.state',      props: {}, tags: [] },
  { id: 'concept.Collection',            kind: 'rtp.concept',           props: {}, tags: [] },
  { id: 'action.Collection.create',      kind: 'rtp.action',            props: {}, tags: [] },
  { id: 'transition.MapOverview.TAP_PIN', kind: 'statechart.transition', props: {}, tags: [] },
];

const edges: Edge[] = [
  { id: 'e-sub-cd-nav',  kind: 'statechart.substate-of', from: 'composite.CollectionDetail', to: 'region.nav',                 props: {}, tags: [] },
  { id: 'e-sub-mp-cd',   kind: 'statechart.substate-of', from: 'state.mapProjection',         to: 'composite.CollectionDetail', props: {}, tags: [] },
  { id: 'e-sub-lp-cd',   kind: 'statechart.substate-of', from: 'state.listProjection',        to: 'composite.CollectionDetail', props: {}, tags: [] },
  { id: 'e-sub-mo-nav',  kind: 'statechart.substate-of', from: 'state.MapOverview',           to: 'region.nav',                 props: {}, tags: [] },
  { id: 'e-trans-mo-cd', kind: 'statechart.transition',  from: 'state.MapOverview',           to: 'composite.CollectionDetail', props: {}, tags: [] },
  { id: 'e-btc-ac-cc',   kind: 'rtp.belongs-to-concept', from: 'action.Collection.create',    to: 'concept.Collection',         props: {}, tags: [] },
  { id: 'e-inv-tap-ac',  kind: 'statechart.invokes-action', from: 'transition.MapOverview.TAP_PIN', to: 'action.Collection.create', props: {}, tags: [] },
];

const statechartView: View = {
  id: 'statechart',
  name: 'Statechart',
  nodeRoles: {
    'statechart.region':     'spatial',
    'statechart.composite':  'spatial',
    'statechart.state':      'spatial',
    'statechart.transition': 'hidden',
    'rtp.concept':           'hidden',
    'rtp.action':            'latent',
  },
  edgeRoles: {
    'statechart.substate-of':    'contain',
    'statechart.transition':     'arrow',
    'statechart.invokes-action': 'summary',
    'rtp.belongs-to-concept':    'hidden',
  },
  layers: {},
  layout: { algorithm: 'manual' },
};

const conceptMapView: View = {
  id: 'concept-map',
  name: 'Concept Map',
  nodeRoles: {
    'statechart.region':     'hidden',
    'statechart.composite':  'hidden',
    'statechart.state':      'hidden',
    'statechart.transition': 'hidden',
    'rtp.concept':           'spatial',
    'rtp.action':            'spatial',
  },
  edgeRoles: {
    'rtp.belongs-to-concept':    'contain',
    'statechart.substate-of':    'hidden',
    'statechart.transition':     'hidden',
    'statechart.invokes-action': 'hidden',
  },
  layers: {},
  layout: { algorithm: 'manual' },
};

const graph = buildGraph(nodes, edges);

// ---------------------------------------------------------------------------

describe('evaluateView — statechart view', () => {
  const scene = evaluateView(graph, statechartView);

  it('spatialNodes contains all spatial kinds (6 nodes)', () => {
    const ids = scene.spatialNodes.map((n) => n.id);
    expect(ids).toContain('region.nav');
    expect(ids).toContain('region.overlay');
    expect(ids).toContain('composite.CollectionDetail');
    expect(ids).toContain('state.mapProjection');
    expect(ids).toContain('state.listProjection');
    expect(ids).toContain('state.MapOverview');
    expect(ids).not.toContain('concept.Collection');
    expect(ids).not.toContain('action.Collection.create');
    expect(ids).not.toContain('transition.MapOverview.TAP_PIN');
    expect(scene.spatialNodes).toHaveLength(6);
  });

  it('latentNodes contains only rtp.action', () => {
    expect(scene.latentNodes).toHaveLength(1);
    expect(scene.latentNodes[0].id).toBe('action.Collection.create');
  });

  it('arrows contains the one statechart.transition edge', () => {
    expect(scene.arrows).toHaveLength(1);
    expect(scene.arrows[0].id).toBe('e-trans-mo-cd');
  });

  it('summaryEdges contains the invokes-action edge', () => {
    expect(scene.summaryEdges).toHaveLength(1);
    expect(scene.summaryEdges[0].id).toBe('e-inv-tap-ac');
  });

  it('containment rootIds are region.nav and region.overlay', () => {
    expect(scene.containment.rootIds).toContain('region.nav');
    expect(scene.containment.rootIds).toContain('region.overlay');
    expect(scene.containment.rootIds).toHaveLength(2);
  });

  it('containment tree has correct parent-child relationships', () => {
    expect(scene.containment.parentOf.get('composite.CollectionDetail')).toBe('region.nav');
    expect(scene.containment.parentOf.get('state.MapOverview')).toBe('region.nav');
    expect(scene.containment.parentOf.get('state.mapProjection')).toBe('composite.CollectionDetail');
    expect(scene.containment.parentOf.get('state.listProjection')).toBe('composite.CollectionDetail');
  });

  it('orphan-summary-edge warning for invokes-action (source is hidden transition)', () => {
    // transition.MapOverview.TAP_PIN is hidden, so the summary chip has no spatial node to render on.
    const orphan = scene.warnings.find((w) => w.code === 'orphan-summary-edge');
    expect(orphan).toBeDefined();
    expect(orphan?.id).toBe('e-inv-tap-ac');
  });

  it('no latent-without-summary warning — action.Collection.create is the summary edge target', () => {
    const latentWarn = scene.warnings.find((w) => w.code === 'latent-without-summary');
    expect(latentWarn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('evaluateView — concept-map view', () => {
  const scene = evaluateView(graph, conceptMapView);

  it('spatialNodes contains concept and action', () => {
    const ids = scene.spatialNodes.map((n) => n.id);
    expect(ids).toContain('concept.Collection');
    expect(ids).toContain('action.Collection.create');
    expect(scene.spatialNodes).toHaveLength(2);
  });

  it('latentNodes is empty', () => {
    expect(scene.latentNodes).toHaveLength(0);
  });

  it('arrows is empty', () => {
    expect(scene.arrows).toHaveLength(0);
  });

  it('summaryEdges is empty', () => {
    expect(scene.summaryEdges).toHaveLength(0);
  });

  it('containment: concept.Collection contains action.Collection.create', () => {
    expect(scene.containment.parentOf.get('action.Collection.create')).toBe('concept.Collection');
    expect(scene.containment.rootIds).toContain('concept.Collection');
    expect(scene.containment.rootIds).not.toContain('action.Collection.create');
  });

  it('no warnings', () => {
    expect(scene.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('evaluateView — latent-without-summary warning', () => {
  it('emits warning when latent node has no summary edge', () => {
    const nodesWithLatent: Node[] = [
      { id: 'n-spatial', kind: 'rtp.concept', props: {}, tags: [] },
      { id: 'n-latent',  kind: 'rtp.action',  props: {}, tags: [] },
    ];
    const g = buildGraph(nodesWithLatent, []);
    const view: View = {
      id: 'test',
      name: 'Test',
      nodeRoles: { 'rtp.concept': 'spatial', 'rtp.action': 'latent' },
      edgeRoles: {},
      layers: {},
      layout: { algorithm: 'manual' },
    };
    const scene = evaluateView(g, view);
    expect(scene.warnings).toHaveLength(1);
    expect(scene.warnings[0].code).toBe('latent-without-summary');
    expect(scene.warnings[0].id).toBe('n-latent');
  });

  it('no warning when latent node appears as summary edge target', () => {
    const nodesWithLatent: Node[] = [
      { id: 'n-spatial', kind: 'rtp.concept', props: {}, tags: [] },
      { id: 'n-latent',  kind: 'rtp.action',  props: {}, tags: [] },
    ];
    const edgesWithSummary: Edge[] = [
      { id: 'es1', kind: 'rtp.invokes', from: 'n-spatial', to: 'n-latent', props: {}, tags: [] },
    ];
    const g = buildGraph(nodesWithLatent, edgesWithSummary);
    const view: View = {
      id: 'test',
      name: 'Test',
      nodeRoles: { 'rtp.concept': 'spatial', 'rtp.action': 'latent' },
      edgeRoles: { 'rtp.invokes': 'summary' },
      layers: {},
      layout: { algorithm: 'manual' },
    };
    const scene = evaluateView(g, view);
    expect(scene.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('evaluateView — orphan-summary-edge warning', () => {
  it('emits warning when summary edge source is not spatial', () => {
    // The summary edge's from node is hidden, so it has nowhere to render a chip.
    const n: Node[] = [
      { id: 'n-hidden',  kind: 'rtp.hidden',  props: {}, tags: [] },
      { id: 'n-spatial', kind: 'rtp.concept', props: {}, tags: [] },
    ];
    const e: Edge[] = [
      { id: 'es2', kind: 'rtp.link', from: 'n-hidden', to: 'n-spatial', props: {}, tags: [] },
    ];
    const g = buildGraph(n, e);
    const view: View = {
      id: 'test',
      name: 'Test',
      nodeRoles: { 'rtp.concept': 'spatial', 'rtp.hidden': 'hidden' },
      edgeRoles: { 'rtp.link': 'summary' },
      layers: {},
      layout: { algorithm: 'manual' },
    };
    const scene = evaluateView(g, view);
    const orphan = scene.warnings.find((w) => w.code === 'orphan-summary-edge');
    expect(orphan).toBeDefined();
    expect(orphan?.id).toBe('es2');
  });
});

// ---------------------------------------------------------------------------

describe('evaluateView — determinism', () => {
  it('produces structurally equal SceneGraphs on repeated calls', () => {
    const s1 = evaluateView(graph, statechartView);
    const s2 = evaluateView(graph, statechartView);
    expect(s1.spatialNodes.map((n) => n.id)).toEqual(s2.spatialNodes.map((n) => n.id));
    expect(s1.latentNodes.map((n) => n.id)).toEqual(s2.latentNodes.map((n) => n.id));
    expect(s1.arrows.map((e) => e.id)).toEqual(s2.arrows.map((e) => e.id));
    expect(s1.summaryEdges.map((e) => e.id)).toEqual(s2.summaryEdges.map((e) => e.id));
    expect(s1.containment.rootIds).toEqual(s2.containment.rootIds);
  });
});

// ---------------------------------------------------------------------------

describe('evaluateView — gating seam', () => {
  it('without gating, scene matches pre-gating behavior (spatial/latent only)', () => {
    const scene = evaluateView(graph, statechartView);
    expect(scene.peekNodes).toHaveLength(0);
    expect(scene.spatialNodes).toHaveLength(6);
    expect(scene.latentNodes).toHaveLength(1);
    // nodeStates map has entries for all spatial + latent
    expect(scene.nodeStates.get('region.nav')).toBe('spatial');
    expect(scene.nodeStates.get('action.Collection.create')).toBe('latent');
    expect(scene.nodeStates.get('concept.Collection')).toBe('hidden');
  });

  it('spatial node in peek set demotes to peek, absent from spatialNodes', () => {
    const scene = evaluateView(graph, statechartView, { peek: new Set(['region.nav']) });
    expect(scene.nodeStates.get('region.nav')).toBe('peek');
    expect(scene.peekNodes.map((n) => n.id)).toContain('region.nav');
    expect(scene.spatialNodes.map((n) => n.id)).not.toContain('region.nav');
    // other spatial nodes unaffected
    expect(scene.spatialNodes.map((n) => n.id)).toContain('region.overlay');
    expect(scene.spatialNodes).toHaveLength(5);
    expect(scene.peekNodes).toHaveLength(1);
  });

  it('latent node in peek set demotes to peek', () => {
    const scene = evaluateView(graph, statechartView, {
      peek: new Set(['action.Collection.create']),
    });
    expect(scene.nodeStates.get('action.Collection.create')).toBe('peek');
    expect(scene.peekNodes.map((n) => n.id)).toContain('action.Collection.create');
    expect(scene.latentNodes.map((n) => n.id)).not.toContain('action.Collection.create');
    expect(scene.latentNodes).toHaveLength(0);
    expect(scene.peekNodes).toHaveLength(1);
  });

  it('hidden node in peek set stays hidden (gating never resurrects hidden)', () => {
    const scene = evaluateView(graph, statechartView, {
      peek: new Set(['concept.Collection']),
    });
    expect(scene.nodeStates.get('concept.Collection')).toBe('hidden');
    expect(scene.peekNodes.map((n) => n.id)).not.toContain('concept.Collection');
    expect(scene.spatialNodes.map((n) => n.id)).not.toContain('concept.Collection');
  });

  it('peek node appears in containment tree (still occupies space)', () => {
    // region.nav is a root in statechart view — peek-demoting it should keep
    // it in containment so its children are still layoutable.
    const scene = evaluateView(graph, statechartView, { peek: new Set(['region.nav']) });
    expect(scene.containment.rootIds).toContain('region.nav');
    expect(scene.containment.childrenOf.get('region.nav')).toBeDefined();
  });

  it('omitting gating produces identical scene structure to passing empty gating', () => {
    const s1 = evaluateView(graph, statechartView);
    const s2 = evaluateView(graph, statechartView, {});
    expect(s1.spatialNodes.map((n) => n.id)).toEqual(s2.spatialNodes.map((n) => n.id));
    expect(s1.latentNodes.map((n) => n.id)).toEqual(s2.latentNodes.map((n) => n.id));
    expect(s1.peekNodes).toHaveLength(0);
    expect(s2.peekNodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('evaluateView — nodeStates map', () => {
  it('all nodes have an entry in nodeStates', () => {
    const scene = evaluateView(graph, statechartView);
    for (const node of graph.nodes.values()) {
      expect(scene.nodeStates.has(node.id)).toBe(true);
    }
  });

  it('nodeStates is consistent with derived arrays', () => {
    const scene = evaluateView(graph, statechartView);
    for (const n of scene.spatialNodes) {
      expect(scene.nodeStates.get(n.id)).toBe('spatial');
    }
    for (const n of scene.latentNodes) {
      expect(scene.nodeStates.get(n.id)).toBe('latent');
    }
    for (const n of scene.peekNodes) {
      expect(scene.nodeStates.get(n.id)).toBe('peek');
    }
  });
});

// ---------------------------------------------------------------------------

describe('evaluateView — unknown kind', () => {
  it('treats nodes with kinds not in nodeRoles as hidden, no warning', () => {
    // transition.MapOverview.TAP_PIN is not in statechartView.nodeRoles... wait,
    // it IS listed as 'hidden'. Let's use a kind that genuinely isn't in the view.
    const n: Node[] = [
      { id: 'n-known',   kind: 'rtp.concept',  props: {}, tags: [] },
      { id: 'n-unknown', kind: 'rtp.unknown-future-type', props: {}, tags: [] },
    ];
    const g = buildGraph(n, []);
    const view: View = {
      id: 'test',
      name: 'Test',
      nodeRoles: { 'rtp.concept': 'spatial' },
      edgeRoles: {},
      layers: {},
      layout: { algorithm: 'manual' },
    };
    const scene = evaluateView(g, view);
    expect(scene.spatialNodes).toHaveLength(1);
    expect(scene.spatialNodes[0].id).toBe('n-known');
    expect(scene.latentNodes).toHaveLength(0);
    expect(scene.warnings).toHaveLength(0);
  });
});
