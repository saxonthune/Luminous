import { describe, expect, it } from 'vitest';
import type { MerinoDocument, SetNodeAction } from '@luminous/core/merino';
import { buildFlowLayoutActions, buildRemoveOverlapActions } from '../tidy.ts';

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

const flowEdgeType = { id: 'flows', name: 'flows', color: 'accent-1' as const, dash: 'solid' as const, arrowHead: true, directed: true };
const plainEdgeType = { id: 'assoc', name: 'assoc', color: 'accent-2' as const, dash: 'solid' as const, arrowHead: false, directed: false };

/** The resulting relative position of each contained child after the flow
 * actions: the write if one was emitted, otherwise its unchanged stored x/y.
 * (A child already at its computed slot emits no action.) */
function posBy(doc: MerinoDocument, actions: SetNodeAction[]): Map<string, { x: number; y: number }> {
  const moved = new Map(actions.map((a) => [a.id, { x: a.x!, y: a.y! }]));
  const out = new Map<string, { x: number; y: number }>();
  for (const n of doc.nodes) {
    if (n.parent === undefined) continue;
    out.set(n.id, moved.get(n.id) ?? { x: n.x ?? 0, y: n.y ?? 0 });
  }
  return out;
}

describe('Merino tidy — flow layout', () => {
  it('places a directed edge’s target in a row below its source', () => {
    const doc: MerinoDocument = {
      v: 1, nodeTypes, edgeTypes: [flowEdgeType],
      nodes: [
        { id: 'box', tab: 'requirements', type: 'freeform', name: 'Box' },
        { id: 'a', tab: 'requirements', type: 'leaf', name: 'A', parent: 'box', x: 500, y: 500 },
        { id: 'b', tab: 'requirements', type: 'leaf', name: 'B', parent: 'box', x: 0, y: 0 },
      ],
      edges: [{ id: 'e', tab: 'requirements', type: 'flows', from: 'a', to: 'b' }],
    };
    const pos = posBy(doc, buildFlowLayoutActions(doc, 'box') as SetNodeAction[]);
    expect(pos.get('a')!.y).toBeLessThan(pos.get('b')!.y);
  });

  it('lifts an edge into a nested container to rank the ancestor child', () => {
    // `a` (direct child) points at `g`, buried inside sibling container `grp`.
    // The edge lifts to a -> grp, so grp lands a row below a.
    const doc: MerinoDocument = {
      v: 1, nodeTypes, edgeTypes: [flowEdgeType],
      nodes: [
        { id: 'box', tab: 'requirements', type: 'freeform', name: 'Box' },
        { id: 'a', tab: 'requirements', type: 'leaf', name: 'A', parent: 'box', x: 0, y: 0 },
        { id: 'grp', tab: 'requirements', type: 'freeform', name: 'Grp', parent: 'box', x: 400, y: 0 },
        { id: 'g', tab: 'requirements', type: 'leaf', name: 'G', parent: 'grp', x: 0, y: 0 },
      ],
      edges: [{ id: 'e', tab: 'requirements', type: 'flows', from: 'a', to: 'g' }],
    };
    const actions = buildFlowLayoutActions(doc, 'box') as SetNodeAction[];
    // Only direct children of `box` are repositioned; the buried `g` is not.
    expect(actions.some((a) => a.id === 'g')).toBe(false);
    const pos = posBy(doc, actions);
    expect(pos.get('a')!.y).toBeLessThan(pos.get('grp')!.y);
  });

  it('puts unconnected children in the same top row, side by side', () => {
    const doc: MerinoDocument = {
      v: 1, nodeTypes, edgeTypes: [flowEdgeType],
      nodes: [
        { id: 'box', tab: 'requirements', type: 'freeform', name: 'Box' },
        { id: 'a', tab: 'requirements', type: 'leaf', name: 'A', parent: 'box', x: 30, y: 200 },
        { id: 'b', tab: 'requirements', type: 'leaf', name: 'B', parent: 'box', x: 90, y: 700 },
      ],
      edges: [],
    };
    const pos = posBy(doc, buildFlowLayoutActions(doc, 'box') as SetNodeAction[]);
    expect(pos.get('a')!.y).toBe(pos.get('b')!.y);
    expect(pos.get('a')!.x).not.toBe(pos.get('b')!.x);
  });

  it('ignores an undirected edge type', () => {
    const doc: MerinoDocument = {
      v: 1, nodeTypes, edgeTypes: [plainEdgeType],
      nodes: [
        { id: 'box', tab: 'requirements', type: 'freeform', name: 'Box' },
        { id: 'a', tab: 'requirements', type: 'leaf', name: 'A', parent: 'box', x: 0, y: 0 },
        { id: 'b', tab: 'requirements', type: 'leaf', name: 'B', parent: 'box', x: 400, y: 0 },
      ],
      edges: [{ id: 'e', tab: 'requirements', type: 'assoc', from: 'a', to: 'b' }],
    };
    const pos = posBy(doc, buildFlowLayoutActions(doc, 'box') as SetNodeAction[]);
    // No directed constraint — both stay in one row.
    expect(pos.get('a')!.y).toBe(pos.get('b')!.y);
  });

  it('writes only non-negative positions', () => {
    const doc: MerinoDocument = {
      v: 1, nodeTypes, edgeTypes: [flowEdgeType],
      nodes: [
        { id: 'box', tab: 'requirements', type: 'freeform', name: 'Box' },
        { id: 'a', tab: 'requirements', type: 'leaf', name: 'A', parent: 'box', x: -300, y: -300 },
        { id: 'b', tab: 'requirements', type: 'leaf', name: 'B', parent: 'box', x: 0, y: 0 },
      ],
      edges: [{ id: 'e', tab: 'requirements', type: 'flows', from: 'a', to: 'b' }],
    };
    for (const a of buildFlowLayoutActions(doc, 'box') as SetNodeAction[]) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('does nothing for a list Container', () => {
    const doc = overlappingDoc();
    doc.nodes[0].type = 'list';
    expect(buildFlowLayoutActions(doc, 'box')).toEqual([]);
  });
});
