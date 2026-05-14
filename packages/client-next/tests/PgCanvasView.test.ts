/**
 * Pure unit test for PgCanvasView logic (evaluateView + gridLayout).
 *
 * No DOM rendering: @solidjs/testing-library is not in client-next's deps.
 * This test validates the data pipeline that PgCanvasView drives.
 * DOM nesting assertion skipped per plan fallback.
 */
import { describe, it, expect } from 'vitest';
import { buildGraph, evaluateView } from '@luminous/core';
import type { Node, Edge, View } from '@luminous/core';
import { gridLayout, resolveAbsolutePositionByParentOf } from '@luminous/cactus';

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
