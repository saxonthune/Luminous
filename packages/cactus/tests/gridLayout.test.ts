import { describe, it, expect } from 'vitest';
import { gridLayout } from '../src/gridLayout';

describe('gridLayout', () => {
  it('returns empty maps for no roots', () => {
    const { positions, sizes } = gridLayout({
      rootIds: [],
      childrenOf: new Map(),
      edges: [],
    });
    expect(positions.size).toBe(0);
    expect(sizes.size).toBe(0);
  });

  it('single root with no children gets default nodeSize', () => {
    const { positions, sizes } = gridLayout({
      rootIds: ['a'],
      childrenOf: new Map(),
      edges: [],
    });
    expect(positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(sizes.get('a')).toEqual({ w: 120, h: 60 });
  });

  it('root with 4 children gets a 2-column grid layout', () => {
    const children = ['c1', 'c2', 'c3', 'c4'];
    const childrenOf = new Map([['root', children]]);
    const { positions, sizes } = gridLayout(
      {
        rootIds: ['root'],
        childrenOf,
        headerHeight: 20,
        edges: [],
        layoutPolicy: new Map([['root', 'grid']]),
      },
      { nodeSize: { w: 100, h: 50 }, padding: 10, gap: 5 },
    );

    // With 4 children: ceil(sqrt(4)) = 2 columns
    // Row 0: c1 at (10, 30), c2 at (115, 30)
    // Row 1: c3 at (10, 85), c4 at (115, 85)
    expect(positions.get('c1')).toEqual({ x: 10, y: 30 });
    expect(positions.get('c2')).toEqual({ x: 115, y: 30 });
    expect(positions.get('c3')).toEqual({ x: 10, y: 85 });
    expect(positions.get('c4')).toEqual({ x: 115, y: 85 });

    // Root size grows to enclose children
    const rootSize = sizes.get('root')!;
    // maxRight: 115+100=215, +padding=225
    // maxBottom: 85+50=135, +padding=145
    expect(rootSize.w).toBe(225);
    expect(rootSize.h).toBe(145);
  });

  it('three-level nesting: sizes grow monotonically', () => {
    // region contains composite contains state
    const childrenOf = new Map([
      ['region', ['composite']],
      ['composite', ['state']],
    ]);
    const { sizes } = gridLayout({
      rootIds: ['region'],
      childrenOf,
      edges: [],
    });

    const stateSize = sizes.get('state')!;
    const compositeSize = sizes.get('composite')!;
    const regionSize = sizes.get('region')!;

    expect(compositeSize.w).toBeGreaterThan(stateSize.w);
    expect(compositeSize.h).toBeGreaterThan(stateSize.h);
    expect(regionSize.w).toBeGreaterThan(compositeSize.w);
    expect(regionSize.h).toBeGreaterThan(compositeSize.h);
  });

  it('nodeSizes overrides default nodeSize for leaf nodes', () => {
    const childrenOf = new Map([['parent', ['leaf1', 'leaf2']]]);
    const nodeSizes = new Map([
      ['leaf1', { w: 200, h: 80 }],
      ['leaf2', { w: 150, h: 100 }],
    ]);
    const { sizes } = gridLayout(
      {
        rootIds: ['parent'],
        childrenOf,
        nodeSizes,
        headerHeight: 20,
        edges: [],
        layoutPolicy: new Map([['parent', 'grid']]),
      },
      { nodeSize: { w: 120, h: 60 }, padding: 10, gap: 5 },
    );

    // Leaves use nodeSizes, not nodeSize
    expect(sizes.get('leaf1')).toEqual({ w: 200, h: 80 });
    expect(sizes.get('leaf2')).toEqual({ w: 150, h: 100 });

    // 2 columns (ceil(sqrt(2))=2): leaf1 at (10,30), leaf2 at (215,30)
    // maxRight: max(10+200, 215+150) = 365, +padding = 375
    // maxBottom: max(30+80, 30+100) = 130, +padding = 140
    const parentSize = sizes.get('parent')!;
    expect(parentSize.w).toBe(375);
    expect(parentSize.h).toBe(140);
  });

  it('nodeSizes does not affect parent nodes (parents sized from children)', () => {
    const childrenOf = new Map([['parent', ['leaf']]]);
    // Provide a nodeSizes for parent too — should be ignored since parent has children
    const nodeSizes = new Map([
      ['leaf', { w: 200, h: 80 }],
      ['parent', { w: 999, h: 999 }],
    ]);
    const { sizes } = gridLayout(
      {
        rootIds: ['parent'],
        childrenOf,
        nodeSizes,
        headerHeight: 20,
        edges: [],
      },
      { padding: 10 },
    );

    // leaf uses nodeSizes
    expect(sizes.get('leaf')).toEqual({ w: 200, h: 80 });
    // parent is sized from children, not nodeSizes
    const parentSize = sizes.get('parent')!;
    expect(parentSize.w).not.toBe(999);
    expect(parentSize.h).not.toBe(999);
  });

  it('headerHeights per-parent overrides global headerHeight for child pack-start', () => {
    const childrenOf = new Map([['parent', ['c1', 'c2']]]);
    const { positions } = gridLayout(
      {
        rootIds: ['parent'],
        childrenOf,
        headerHeight: 20,
        headerHeights: new Map([['parent', 80]]),
        edges: [],
      },
      { nodeSize: { w: 100, h: 50 }, padding: 10, gap: 5 },
    );

    // With per-parent headerHeight=80: children start at y = 80 + padding(10) = 90
    expect(positions.get('c1')!.y).toBe(90);
    expect(positions.get('c2')!.y).toBe(90);
  });

  it('headerHeights falls back to global headerHeight for parents not in the map', () => {
    const childrenOf = new Map([['parent', ['c1']]]);
    const { positions } = gridLayout(
      {
        rootIds: ['parent'],
        childrenOf,
        headerHeight: 30,
        headerHeights: new Map([['other', 80]]),
        edges: [],
      },
      { nodeSize: { w: 100, h: 50 }, padding: 10, gap: 5 },
    );

    // parent not in headerHeights map, falls back to headerHeight=30: y = 30 + 10 = 40
    expect(positions.get('c1')!.y).toBe(40);
  });

  it('multiple roots are placed left-to-right with gap', () => {
    const { positions, sizes } = gridLayout(
      {
        rootIds: ['r1', 'r2'],
        childrenOf: new Map(),
        edges: [],
      },
      { nodeSize: { w: 100, h: 50 }, gap: 10 },
    );

    expect(positions.get('r1')).toEqual({ x: 0, y: 0 });
    // r2 starts after r1.w + gap = 100 + 10 = 110
    expect(positions.get('r2')).toEqual({ x: 110, y: 0 });
    expect(sizes.get('r1')).toEqual({ w: 100, h: 50 });
    expect(sizes.get('r2')).toEqual({ w: 100, h: 50 });
  });

  it('edges field is accepted and ignored by grid layout', () => {
    const { positions, sizes } = gridLayout({
      rootIds: ['a', 'b'],
      childrenOf: new Map(),
      edges: [{ id: 'e1', from: 'a', to: 'b', label: { w: 60, h: 20 } }],
    });
    expect(positions.has('a')).toBe(true);
    expect(positions.has('b')).toBe(true);
    expect(sizes.has('a')).toBe(true);
    expect(sizes.has('b')).toBe(true);
  });
});
