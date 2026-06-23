import { describe, it, expect } from 'vitest';
import { composeLayout, type ComposeLayoutInput } from './composeLayout.js';
import type { ChildLayoutPolicy } from './layout-types.js';

// One container `c` with three equal-sized children, laid out under a given policy.
function scene(policy: ChildLayoutPolicy, algorithm: 'grid' | 'elk'): ComposeLayoutInput {
  return {
    rootIds: ['c'],
    childrenOf: new Map([['c', ['x', 'y', 'z']]]),
    nodeSizes: new Map([
      ['x', { w: 100, h: 40 }],
      ['y', { w: 100, h: 40 }],
      ['z', { w: 100, h: 40 }],
    ]),
    edges: [],
    policies: new Map([['c', policy]]),
    top: { algorithm },
  };
}

describe('composeLayout', () => {
  it('stack-v lays children out as a single column (same x, increasing y)', async () => {
    const { positions } = await composeLayout(scene('stack-v', 'grid'));
    const x = positions.get('x')!;
    const y = positions.get('y')!;
    const z = positions.get('z')!;

    expect(x.x).toBe(y.x);
    expect(y.x).toBe(z.x);
    expect(y.y).toBeGreaterThan(x.y);
    expect(z.y).toBeGreaterThan(y.y);
  });

  it('switching policy from pack to stack-v repositions children AND resizes the box together', async () => {
    const packed = await composeLayout(scene('pack', 'grid'));
    const stacked = await composeLayout(scene('stack-v', 'grid'));

    // The children actually move — at least one child position differs.
    const moved = ['x', 'y', 'z'].some((id) => {
      const a = packed.positions.get(id)!;
      const b = stacked.positions.get(id)!;
      return a.x !== b.x || a.y !== b.y;
    });
    expect(moved).toBe(true);

    // And the container box is taller/narrower under the vertical stack — proving
    // the box size and the child positions come from the SAME pass (they cannot
    // desync, which is the whole point of the single solver).
    const packBox = packed.sizes.get('c')!;
    const stackBox = stacked.sizes.get('c')!;
    expect(stackBox.h).toBeGreaterThan(packBox.h);
    expect(stackBox.w).toBeLessThanOrEqual(packBox.w);
  });

  it('top-level pass gives roots absolute positions without clobbering stacked children', async () => {
    const { positions, sizes } = await composeLayout(scene('stack-v', 'elk'));

    // Root got a position and size from the top-level pass.
    expect(positions.get('c')).toBeDefined();
    expect(sizes.get('c')).toBeDefined();

    // Children keep their interior (parent-relative) column positions — the merge
    // does not overwrite them with anything from the top-level pass.
    const x = positions.get('x')!;
    const y = positions.get('y')!;
    const z = positions.get('z')!;
    expect(x.x).toBe(y.x);
    expect(y.x).toBe(z.x);
    expect(y.y).toBeGreaterThan(x.y);
    expect(z.y).toBeGreaterThan(y.y);
  });
});
