import { describe, expect, it } from 'vitest';
import type { MerinoDocument, SetNodeAction } from '@luminous/core/merino';
import { buildRemoveOverlapActions } from '../tidy.ts';

const nodeTypes = [
  { id: 'freeform', name: 'Freeform', color: 'accent-1' as const, layout: 'container' as const },
  { id: 'list', name: 'List', color: 'accent-2' as const, layout: 'list' as const },
  { id: 'leaf', name: 'Leaf', color: 'accent-3' as const },
];

/** Two children stacked at the same spot inside a freeform Container. */
function overlappingDoc(): MerinoDocument {
  return {
    v: 1,
    nodeTypes,
    edgeTypes: [],
    nodes: [
      { id: 'box', tab: 'requirements', type: 'freeform', name: 'Box' },
      { id: 'a', tab: 'requirements', type: 'leaf', name: 'A', parent: 'box', x: 0, y: 0 },
      { id: 'b', tab: 'requirements', type: 'leaf', name: 'B', parent: 'box', x: 10, y: 10 },
    ],
    edges: [],
  };
}

const asSet = (actions: SetNodeAction[]) => new Map(actions.map((a) => [a.id, a]));

describe('Merino tidy — remove overlap', () => {
  it('separates overlapping children and keeps their stored positions non-negative', () => {
    const actions = buildRemoveOverlapActions(overlappingDoc(), 'box') as SetNodeAction[];
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
    }
    // After the writes the two children no longer overlap.
    const moved = asSet(actions);
    const posOf = (id: string, fallback: { x: number; y: number }) => {
      const a = moved.get(id);
      return a ? { x: a.x!, y: a.y! } : fallback;
    };
    const a = posOf('a', { x: 0, y: 0 });
    const b = posOf('b', { x: 10, y: 10 });
    const w = 168; // NODE_WIDTH; leaves render at the uniform compact size
    const h = 64;
    const overlap = a.x < b.x + w && a.x + w > b.x && a.y < b.y + h && a.y + h > b.y;
    expect(overlap).toBe(false);
  });

  it('does nothing for a list Container', () => {
    const doc = overlappingDoc();
    doc.nodes[0].type = 'list';
    expect(buildRemoveOverlapActions(doc, 'box')).toEqual([]);
  });

  it('does nothing when a Container has fewer than two children', () => {
    const doc = overlappingDoc();
    doc.nodes = doc.nodes.filter((n) => n.id !== 'b');
    expect(buildRemoveOverlapActions(doc, 'box')).toEqual([]);
  });
});
