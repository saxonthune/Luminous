/**
 * Unit tests for measureDeepLod.
 *
 * jsdom's getBoundingClientRect() always returns zeros, so measured sizes fall
 * back to the DEFAULT_SIZE (120×60). Tests verify structural correctness —
 * entries for every node, minimum-size floor, cache stability — rather than
 * pixel-exact values. Real browser measurements are validated in the manual
 * verification step (rtp-navigation canvas).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildGraph, registerPack, resetRegistry, getPrimitivesBuiltin } from '@luminous/core';
import type { Node, Edge, View, Pack } from '@luminous/core';
import { measureDeepLod } from '../deepLodMeasure';

const dummySchema = {
  parse: (x: unknown) => x,
  safeParse: (x: unknown) => ({ success: true as const, data: x }),
};

const view: View = {
  id: 'test',
  name: 'Test',
  nodeRoles: { 'test.widget': 'spatial', 'test.container': 'spatial' },
  edgeRoles: { 'contains': 'contain' },
  layers: {},
  layout: { algorithm: 'manual' },
};

describe('measureDeepLod', () => {
  beforeEach(() => {
    resetRegistry();
    registerPack(getPrimitivesBuiltin());
  });

  afterEach(() => {
    resetRegistry();
  });

  it('returns a size entry for every node in the graph', () => {
    const testPack: Pack = {
      id: 'test-pack',
      version: '0.0.1',
      nodeKinds: [
        {
          id: 'test.widget',
          label: 'Widget',
          propsSchema: dummySchema,
          idDerivation: () => 'n',
          render: { card: { type: 'text', value: 'hello', style: 'body' } },
        },
      ],
      edgeKinds: [],
      views: [],
      layers: [],
      disclosureSchemas: [],
    };
    registerPack(testPack);

    const nodes: Node[] = [
      { id: 'a', kind: 'test.widget', props: {}, tags: [] },
      { id: 'b', kind: 'test.widget', props: {}, tags: [] },
    ];
    const graph = buildGraph(nodes, []);
    const { sizes } = measureDeepLod(graph, view);

    expect(sizes.has('a')).toBe(true);
    expect(sizes.has('b')).toBe(true);
  });

  it('returns sizes at least the minimum floor (120×60) when jsdom returns 0×0', () => {
    const testPack: Pack = {
      id: 'test-pack2',
      version: '0.0.1',
      nodeKinds: [
        {
          id: 'test.widget',
          label: 'Widget',
          propsSchema: dummySchema,
          idDerivation: () => 'n',
          render: { card: { type: 'text', value: 'hi', style: 'body' } },
        },
      ],
      edgeKinds: [],
      views: [],
      layers: [],
      disclosureSchemas: [],
    };
    registerPack(testPack);

    const nodes: Node[] = [{ id: 'x', kind: 'test.widget', props: {}, tags: [] }];
    const graph = buildGraph(nodes, []);
    const { sizes } = measureDeepLod(graph, view);

    const sz = sizes.get('x')!;
    expect(sz.w).toBeGreaterThanOrEqual(120);
    expect(sz.h).toBeGreaterThanOrEqual(60);
  });

  it('returns empty sizes for an empty graph', () => {
    const graph = buildGraph([], []);
    const { sizes, headerHeights } = measureDeepLod(graph, view);
    expect(sizes.size).toBe(0);
    expect(headerHeights.size).toBe(0);
  });

  it('uses fallback render for nodes without a kind render', () => {
    // test.container has no render → generateFallbackRender path
    const testPack: Pack = {
      id: 'test-pack3',
      version: '0.0.1',
      nodeKinds: [
        {
          id: 'test.container',
          label: 'Container',
          propsSchema: dummySchema,
          idDerivation: () => 'n',
          // no render record
        },
      ],
      edgeKinds: [
        {
          id: 'contains',
          label: 'Contains',
          propsSchema: dummySchema,
          directed: true,
        },
      ],
      views: [],
      layers: [],
      disclosureSchemas: [],
    };
    registerPack(testPack);

    const nodes: Node[] = [{ id: 'c', kind: 'test.container', props: { name: 'Root' }, tags: [] }];
    const graph = buildGraph(nodes, []);
    const { sizes } = measureDeepLod(graph, view);

    expect(sizes.has('c')).toBe(true);
  });

  it('calling twice with the same graph returns consistent sizes (cache hit)', () => {
    const testPack: Pack = {
      id: 'test-pack4',
      version: '0.0.1',
      nodeKinds: [
        {
          id: 'test.widget',
          label: 'Widget',
          propsSchema: dummySchema,
          idDerivation: () => 'n',
          render: { card: { type: 'text', value: 'cached', style: 'body' } },
        },
      ],
      edgeKinds: [],
      views: [],
      layers: [],
      disclosureSchemas: [],
    };
    registerPack(testPack);

    const nodes: Node[] = [{ id: 'w', kind: 'test.widget', props: {}, tags: [] }];
    const graph = buildGraph(nodes, []);

    const first = measureDeepLod(graph, view);
    const second = measureDeepLod(graph, view);

    const s1 = first.sizes.get('w')!;
    const s2 = second.sizes.get('w')!;
    expect(s1.w).toBe(s2.w);
    expect(s1.h).toBe(s2.h);
  });
});
