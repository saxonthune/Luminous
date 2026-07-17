import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { projectAtlasNodes } from '../projection.ts';
import { addDelta, growAncestors, selfAndAncestors, shiftSubtree, type LayoutDelta } from '../layoutOverride.ts';

describe('selfAndAncestors', () => {
  it('returns just the id when it has no parent', () => {
    const parentOf = new Map<string, string>();
    expect(selfAndAncestors('root', parentOf)).toEqual(['root']);
  });

  it('walks up through every ancestor', () => {
    const parentOf = new Map([
      ['grandchild', 'child'],
      ['child', 'parent'],
    ]);
    expect(selfAndAncestors('grandchild', parentOf)).toEqual(['grandchild', 'child', 'parent']);
  });

  it('stops at a node whose parent is not in the map', () => {
    const parentOf = new Map([['child', 'parent']]);
    expect(selfAndAncestors('child', parentOf)).toEqual(['child', 'parent']);
  });
});

describe('addDelta', () => {
  it('seeds a fresh entry from a partial delta, defaulting unset fields to 0', () => {
    const map = new Map<string, LayoutDelta>();
    addDelta(map, 'a', { dx: 5 });
    expect(map.get('a')).toEqual({ dx: 5, dy: 0, dw: 0, dh: 0 });
  });

  it('accumulates additively across repeated calls, so simultaneous gestures compose', () => {
    const map = new Map<string, LayoutDelta>();
    addDelta(map, 'a', { dx: 5, dy: 2 });
    addDelta(map, 'a', { dx: 3, dw: 10 });
    expect(map.get('a')).toEqual({ dx: 8, dy: 2, dw: 10, dh: 0 });
  });
});

describe('shiftSubtree', () => {
  const childrenOf = new Map([
    ['root', ['a', 'b']],
    ['a', ['a1']],
  ]);

  it('does nothing for a zero delta', () => {
    const map = new Map<string, LayoutDelta>();
    shiftSubtree(map, 'root', childrenOf, 0, 0);
    expect(map.size).toBe(0);
  });

  it('shifts the root and every descendant when includeRoot defaults true', () => {
    const map = new Map<string, LayoutDelta>();
    shiftSubtree(map, 'root', childrenOf, 10, 20);
    expect(map.get('root')).toMatchObject({ dx: 10, dy: 20 });
    expect(map.get('a')).toMatchObject({ dx: 10, dy: 20 });
    expect(map.get('a1')).toMatchObject({ dx: 10, dy: 20 });
    expect(map.get('b')).toMatchObject({ dx: 10, dy: 20 });
  });

  it('shifts only descendants, not the root itself, when includeRoot is false', () => {
    const map = new Map<string, LayoutDelta>();
    shiftSubtree(map, 'root', childrenOf, 10, 20, { includeRoot: false });
    expect(map.has('root')).toBe(false);
    expect(map.get('a')).toMatchObject({ dx: 10, dy: 20 });
    expect(map.get('b')).toMatchObject({ dx: 10, dy: 20 });
  });

  it('composes with a prior delta already in the map instead of overwriting it', () => {
    const map = new Map<string, LayoutDelta>();
    addDelta(map, 'a', { dw: 5 });
    shiftSubtree(map, 'root', childrenOf, 10, 20);
    expect(map.get('a')).toEqual({ dx: 10, dy: 20, dw: 5, dh: 0 });
  });
});

describe('growAncestors', () => {
  // A single-child chain (root -> mid -> leaf), all at (0,0) manual so every
  // offset is deterministic.
  const chain: AtlasDocument = {
    v: 1,
    nodes: [
      { id: 'root', name: 'Root', x: 0, y: 0 },
      { id: 'mid', name: 'Mid', parent: 'root', x: 0, y: 0 },
      { id: 'leaf', name: 'Leaf', parent: 'mid', x: 0, y: 0 },
    ],
    edges: [],
  };

  function parentOfFrom(rendered: ReturnType<typeof projectAtlasNodes>): Map<string, string> {
    const m = new Map<string, string>();
    for (const rn of rendered) if (rn.node.parent) m.set(rn.node.id, rn.node.parent);
    return m;
  }

  it('is a no-op for a top-level node — no ancestor to expand', () => {
    const rendered = projectAtlasNodes(chain);
    const map = new Map<string, LayoutDelta>();
    growAncestors(map, 'root', parentOfFrom(rendered), rendered, { dx: 50, dy: 30 });
    expect(map.size).toBe(0);
  });

  it('grows every ancestor on the path by a position shift, one level down the chain', () => {
    const rendered = projectAtlasNodes(chain);
    const map = new Map<string, LayoutDelta>();
    growAncestors(map, 'leaf', parentOfFrom(rendered), rendered, { dx: 50, dy: 30 });

    expect(map.get('mid')).toMatchObject({ dw: 50, dh: 30 });
    expect(map.get('root')).toMatchObject({ dw: 50, dh: 30 });
    // The dragged leaf itself never grows.
    expect(map.has('leaf')).toBe(false);
    expect(map.size).toBe(2);
  });

  it('grows every ancestor on the path by a size grow (the content-resize case)', () => {
    const rendered = projectAtlasNodes(chain);
    const map = new Map<string, LayoutDelta>();
    growAncestors(map, 'leaf', parentOfFrom(rendered), rendered, { dh: 30 });

    expect(map.get('mid')).toMatchObject({ dw: 0, dh: 30 });
    expect(map.get('root')).toMatchObject({ dw: 0, dh: 30 });
  });

  it('leaves a sibling branch unaffected, and stops growing an ancestor once a bigger sibling already dominates it', () => {
    const withSibling: AtlasDocument = {
      v: 1,
      nodes: [
        ...chain.nodes,
        // Far enough from the origin that its extent already exceeds
        // whatever the grown "mid" branch can reach.
        { id: 'big', name: 'Big', parent: 'root', x: 500, y: 500 },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(withSibling);
    const map = new Map<string, LayoutDelta>();
    growAncestors(map, 'leaf', parentOfFrom(rendered), rendered, { dx: 50, dy: 30 });

    // root's committed size already accounts for "big" as the dominant
    // child, so the live-expand preview leaves it exactly as committed.
    expect(map.get('root')).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
    // "big" itself is never touched — it isn't on the dragged node's path.
    expect(map.has('big')).toBe(false);
  });

  it('clamps a negative (up/left) delta to no growth, matching committed sizes exactly', () => {
    const rendered = projectAtlasNodes(chain);
    const map = new Map<string, LayoutDelta>();
    growAncestors(map, 'leaf', parentOfFrom(rendered), rendered, { dx: -50, dy: -30 });

    expect(map.get('mid')).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
    expect(map.get('root')).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
  });
});

describe('composition — simultaneous drag + ctrl-expand', () => {
  it('a Ctrl-drag both shifts the subtree and grows ancestors, additively, in one map', () => {
    const chain: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root', x: 0, y: 0 },
        { id: 'mid', name: 'Mid', parent: 'root', x: 0, y: 0 },
        { id: 'leaf', name: 'Leaf', parent: 'mid', x: 0, y: 0 },
      ],
      edges: [],
    };
    const rendered = projectAtlasNodes(chain);
    const parentOf = new Map<string, string>();
    const childrenOf = new Map<string, string[]>();
    for (const rn of rendered) {
      if (rn.node.parent === undefined) continue;
      parentOf.set(rn.node.id, rn.node.parent);
      const list = childrenOf.get(rn.node.parent) ?? [];
      list.push(rn.node.id);
      childrenOf.set(rn.node.parent, list);
    }

    const map = new Map<string, LayoutDelta>();
    shiftSubtree(map, 'mid', childrenOf, 50, 30, { includeRoot: true });
    growAncestors(map, 'mid', parentOf, rendered, { dx: 50, dy: 30 });

    // mid moved (dragged) and leaf, its descendant, moved with it.
    expect(map.get('mid')).toMatchObject({ dx: 50, dy: 30 });
    expect(map.get('leaf')).toMatchObject({ dx: 50, dy: 30 });
    // root, mid's ancestor, grew to contain mid's dragged position —
    // the shift and the grow land on disjoint-but-adjacent sets in one map.
    expect(map.get('root')).toMatchObject({ dw: 50, dh: 30 });
  });
});
