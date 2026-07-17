import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { arrangeAsColumn, sameParent } from '../arrange.ts';

const GAP = 24;
const HEIGHT = 72;
const WIDTH = 220;

function doc(nodes: AtlasDocument['nodes']): AtlasDocument {
  return { v: 1, nodes, edges: [] };
}

describe('sameParent', () => {
  it('is true when every id shares the same parent', () => {
    const d = doc([
      { id: 'p', name: 'P' },
      { id: 'a', name: 'A', parent: 'p' },
      { id: 'b', name: 'B', parent: 'p' },
    ]);
    expect(sameParent(d, ['a', 'b'])).toBe(true);
  });

  it('is false when ids span different parents (including root)', () => {
    const d = doc([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'a', name: 'A', parent: 'p1' },
      { id: 'b', name: 'B', parent: 'p2' },
      { id: 'c', name: 'C' },
    ]);
    expect(sameParent(d, ['a', 'b'])).toBe(false);
    expect(sameParent(d, ['a', 'c'])).toBe(false);
  });

  it('is trivially true for fewer than two ids', () => {
    expect(sameParent(doc([{ id: 'a', name: 'A' }]), ['a'])).toBe(true);
    expect(sameParent(doc([]), [])).toBe(true);
  });
});

describe('arrangeAsColumn', () => {
  it('stacks the selection vertically at a shared x, ordered by current y, with the expected gap', () => {
    const d = doc([
      { id: 'a', name: 'A', x: 0, y: 300 },
      { id: 'b', name: 'B', x: 0, y: 0 },
      { id: 'c', name: 'C', x: 0, y: 150 },
    ]);
    const result = arrangeAsColumn(d, ['a', 'b', 'c']);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    // Ordered by original y: b (0), c (150), a (300).
    expect(byId.get('b')).toMatchObject({ x: 0, y: 0 });
    expect(byId.get('c')).toMatchObject({ x: 0, y: HEIGHT + GAP });
    expect(byId.get('a')).toMatchObject({ x: 0, y: 2 * (HEIGHT + GAP) });
  });

  it('bakes manual positions (x and y both defined) on every arranged Node', () => {
    const d = doc([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', x: 40, y: 40 },
    ]);
    const result = arrangeAsColumn(d, ['a', 'b']);
    for (const id of ['a', 'b']) {
      const node = result.nodes.find((n) => n.id === id)!;
      expect(node.x).not.toBeUndefined();
      expect(node.y).not.toBeUndefined();
    }
  });

  it('shifts the column right past a non-selected sibling occupying the anchor slot', () => {
    const d = doc([
      { id: 'd', name: 'D', x: 0, y: 0 },
      { id: 'a', name: 'A', x: 0, y: 300 },
      { id: 'b', name: 'B', x: 0, y: 0 },
      { id: 'c', name: 'C', x: 0, y: 150 },
    ]);
    const result = arrangeAsColumn(d, ['a', 'b', 'c']);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    // The anchor column (x=0) overlaps sibling d, so the whole column shifts
    // right by one column-width + gap.
    expect(byId.get('b')?.x).toBe(WIDTH + GAP);
    expect(byId.get('c')?.x).toBe(WIDTH + GAP);
    expect(byId.get('a')?.x).toBe(WIDTH + GAP);
    // The non-selected sibling is untouched.
    expect(byId.get('d')).toMatchObject({ x: 0, y: 0 });
  });

  it('is a no-op for fewer than two ids', () => {
    const d = doc([{ id: 'a', name: 'A' }]);
    expect(arrangeAsColumn(d, ['a'])).toBe(d);
  });

  it('anchors a column inside its container\'s child area, below the header', () => {
    const d = doc([
      { id: 'container', name: 'Container', x: 300, y: 300 },
      { id: 'a', name: 'A', parent: 'container', x: 0, y: 300 },
      { id: 'b', name: 'B', parent: 'container', x: 0, y: 0 },
    ]);
    const result = arrangeAsColumn(d, ['a', 'b']);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    // Stored positions are relative to the child area, so a non-negative
    // anchor here means the column sits below the header, not over it.
    expect(byId.get('b')!.y).toBeGreaterThanOrEqual(0);
    expect(byId.get('a')!.y).toBeGreaterThanOrEqual(0);
  });
});
