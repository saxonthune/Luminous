import { describe, it, expect } from 'vitest';
import { gridLayout } from '../src/gridLayout';

describe('gridLayout', () => {
  it('returns empty maps for no roots', () => {
    const { positions, sizes } = gridLayout({
      rootIds: [],
      childrenOf: new Map(),
    });
    expect(positions.size).toBe(0);
    expect(sizes.size).toBe(0);
  });

  it('single root with no children gets default nodeSize', () => {
    const { positions, sizes } = gridLayout({
      rootIds: ['a'],
      childrenOf: new Map(),
    });
    expect(positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(sizes.get('a')).toEqual({ w: 120, h: 60 });
  });

  it('root with 4 children gets a 2-column grid layout', () => {
    const children = ['c1', 'c2', 'c3', 'c4'];
    const childrenOf = new Map([['root', children]]);
    const { positions, sizes } = gridLayout({
      rootIds: ['root'],
      childrenOf,
      nodeSize: { w: 100, h: 50 },
      padding: 10,
      gap: 5,
      headerHeight: 20,
    });

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
    });

    const stateSize = sizes.get('state')!;
    const compositeSize = sizes.get('composite')!;
    const regionSize = sizes.get('region')!;

    expect(compositeSize.w).toBeGreaterThan(stateSize.w);
    expect(compositeSize.h).toBeGreaterThan(stateSize.h);
    expect(regionSize.w).toBeGreaterThan(compositeSize.w);
    expect(regionSize.h).toBeGreaterThan(compositeSize.h);
  });

  it('multiple roots are placed left-to-right with gap', () => {
    const { positions, sizes } = gridLayout({
      rootIds: ['r1', 'r2'],
      childrenOf: new Map(),
      nodeSize: { w: 100, h: 50 },
      gap: 10,
    });

    expect(positions.get('r1')).toEqual({ x: 0, y: 0 });
    // r2 starts after r1.w + gap = 100 + 10 = 110
    expect(positions.get('r2')).toEqual({ x: 110, y: 0 });
    expect(sizes.get('r1')).toEqual({ w: 100, h: 50 });
    expect(sizes.get('r2')).toEqual({ w: 100, h: 50 });
  });
});
