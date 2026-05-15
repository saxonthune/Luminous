import { describe, it, expect } from 'vitest';
import { elkLayout } from '../src/elkLayout';

describe('elkLayout', () => {
  it('returns positions for all nodes in a simple composite with two children', async () => {
    const result = await elkLayout({
      rootIds: ['root'],
      childrenOf: new Map([['root', ['a', 'b']]]),
      edges: [{ id: 'e1', from: 'a', to: 'b' }],
    });

    expect(result.positions.has('root')).toBe(true);
    expect(result.positions.has('a')).toBe(true);
    expect(result.positions.has('b')).toBe(true);
  });

  it('places child b to the right of child a when direction is RIGHT', async () => {
    const result = await elkLayout({
      rootIds: ['root'],
      childrenOf: new Map([['root', ['a', 'b']]]),
      edges: [{ id: 'e1', from: 'a', to: 'b' }],
      direction: 'RIGHT',
    });

    const posA = result.positions.get('a')!;
    const posB = result.positions.get('b')!;
    expect(posB.x).toBeGreaterThan(posA.x);
  });

  it('composite size is at least as large as children bounding box plus padding', async () => {
    const nodeSize = { w: 80, h: 40 };
    const result = await elkLayout({
      rootIds: ['root'],
      childrenOf: new Map([['root', ['a', 'b']]]),
      edges: [{ id: 'e1', from: 'a', to: 'b' }],
      sizeOf: new Map([
        ['a', nodeSize],
        ['b', nodeSize],
      ]),
      direction: 'RIGHT',
    });

    const rootSize = result.sizes.get('root')!;
    const posA = result.positions.get('a')!;
    const posB = result.positions.get('b')!;

    const minRequired = Math.max(posA.x + nodeSize.w, posB.x + nodeSize.w);
    expect(rootSize.w).toBeGreaterThanOrEqual(minRequired);
  });

  it('returns sizes for all nodes', async () => {
    const result = await elkLayout({
      rootIds: ['root'],
      childrenOf: new Map([['root', ['a', 'b']]]),
      edges: [],
    });

    expect(result.sizes.has('root')).toBe(true);
    expect(result.sizes.has('a')).toBe(true);
    expect(result.sizes.has('b')).toBe(true);
  });

  it('headerHeights per-parent overrides global headerHeight in elk padding', async () => {
    // With a large per-parent headerHeight the root container must be taller than
    // the same layout with the global default headerHeight.
    const nodeSize = { w: 80, h: 40 };
    const [smallHeader, largeHeader] = await Promise.all([
      elkLayout({
        rootIds: ['root'],
        childrenOf: new Map([['root', ['a', 'b']]]),
        edges: [{ id: 'e1', from: 'a', to: 'b' }],
        sizeOf: new Map([['a', nodeSize], ['b', nodeSize]]),
        headerHeight: 10,
        direction: 'DOWN',
      }),
      elkLayout({
        rootIds: ['root'],
        childrenOf: new Map([['root', ['a', 'b']]]),
        edges: [{ id: 'e1', from: 'a', to: 'b' }],
        sizeOf: new Map([['a', nodeSize], ['b', nodeSize]]),
        headerHeight: 10,
        headerHeights: new Map([['root', 100]]),
        direction: 'DOWN',
      }),
    ]);

    const smallRootH = smallHeader.sizes.get('root')!.h;
    const largeRootH = largeHeader.sizes.get('root')!.h;
    expect(largeRootH).toBeGreaterThan(smallRootH);
  });
});
