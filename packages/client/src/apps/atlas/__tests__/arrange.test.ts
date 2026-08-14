import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { arrangeAsColumn, arrangeAsRow, removeOverlap, buildRemoveOverlapActions, sameParent } from '../arrange.ts';

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

  it('lines the selection up horizontally at a shared y, ordered by current x, with the expected gap (row)', () => {
    const d = doc([
      { id: 'a', name: 'A', x: 300, y: 0 },
      { id: 'b', name: 'B', x: 0, y: 0 },
      { id: 'c', name: 'C', x: 150, y: 0 },
    ]);
    const result = arrangeAsRow(d, ['a', 'b', 'c']);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    // Ordered by original x: b (0), c (150), a (300).
    expect(byId.get('b')).toMatchObject({ x: 0, y: 0 });
    expect(byId.get('c')).toMatchObject({ x: WIDTH + GAP, y: 0 });
    expect(byId.get('a')).toMatchObject({ x: 2 * (WIDTH + GAP), y: 0 });
  });

  it('shifts a row down past a non-selected sibling occupying the anchor slot', () => {
    const d = doc([
      { id: 'd', name: 'D', x: 0, y: 0 },
      { id: 'a', name: 'A', x: 300, y: 0 },
      { id: 'b', name: 'B', x: 0, y: 0 },
    ]);
    const result = arrangeAsRow(d, ['a', 'b']);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    expect(byId.get('b')?.y).toBe(HEIGHT + GAP);
    expect(byId.get('a')?.y).toBe(HEIGHT + GAP);
    expect(byId.get('d')).toMatchObject({ x: 0, y: 0 });
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

describe('removeOverlap', () => {
  it('pushes an overlapping top-level pair apart along the axis of least penetration, out to a gap', () => {
    const d = doc([
      { id: 'a', name: 'A', x: 0, y: 0 },
      { id: 'b', name: 'B', x: 100, y: 0 },
    ]);
    const result = removeOverlap(d, undefined);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    // Vertical penetration (72) beats horizontal (120), so the pair splits
    // on y, half each way, ending 12px apart.
    expect(byId.get('a')).toMatchObject({ x: 0, y: -42 });
    expect(byId.get('b')).toMatchObject({ x: 100, y: 42 });
  });

  it('leaves a non-overlapping set untouched', () => {
    const d = doc([
      { id: 'a', name: 'A', x: 0, y: 0 },
      { id: 'b', name: 'B', x: 0, y: 200 },
    ]);
    expect(removeOverlap(d, undefined)).toBe(d);
    expect(buildRemoveOverlapActions(d, undefined)).toEqual([]);
  });

  it('keeps separated Children inside the child area — a push past the top edge shifts the set back in', () => {
    const d = doc([
      { id: 'p', name: 'P' },
      { id: 'a', name: 'A', parent: 'p', x: 0, y: 0 },
      { id: 'b', name: 'B', parent: 'p', x: 0, y: 10 },
    ]);
    const result = removeOverlap(d, 'p');
    const byId = new Map(result.nodes.map((n) => [n.id, n]));

    expect(byId.get('a')!.y).toBeGreaterThanOrEqual(0);
    expect(byId.get('b')!.y).toBeGreaterThanOrEqual(0);
    // Still separated by the gap after the shift.
    expect(byId.get('b')!.y! - byId.get('a')!.y!).toBe(HEIGHT + 12);
  });

  it('does not touch Children of other Containers or deeper descendants', () => {
    const d = doc([
      { id: 'p', name: 'P' },
      { id: 'q', name: 'Q' },
      { id: 'a', name: 'A', parent: 'p', x: 0, y: 0 },
      { id: 'b', name: 'B', parent: 'p', x: 10, y: 10 },
      { id: 'c', name: 'C', parent: 'q', x: 0, y: 0 },
      { id: 'd', name: 'D', parent: 'q', x: 10, y: 10 },
    ]);
    const result = removeOverlap(d, 'p');
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get('c')).toMatchObject({ x: 0, y: 0 });
    expect(byId.get('d')).toMatchObject({ x: 10, y: 10 });
  });
});
