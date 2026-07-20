import { describe, it, expect } from 'vitest';
import { invertAtlasAction, invertAtlasBatch } from '../../src/atlas/history.ts';
import { applyAtlasBatch, buildBisectActions } from '../../src/atlas/operations.ts';
import type { AtlasAction, AtlasDocument } from '../../src/atlas/types.ts';

function doc(nodes: AtlasDocument['nodes'], edges: AtlasDocument['edges'] = []): AtlasDocument {
  return { v: 1, nodes, edges };
}

function roundTrips(before: AtlasDocument, actions: AtlasAction[]) {
  const applied = applyAtlasBatch(before, actions);
  if (!applied.ok) throw new Error(`setup: ${applied.error}`);
  const inverse = invertAtlasBatch(before, actions);
  const restored = applyAtlasBatch(applied.doc, inverse);
  if (!restored.ok) throw new Error(`undo: ${restored.error}`);
  expect(restored.doc).toEqual(before);
}

describe('invertAtlasAction', () => {
  it('inverts addNode into a matching removeNode', () => {
    const before = doc([]);
    const action: AtlasAction = { type: 'addNode', id: 'a', name: 'A' };
    expect(invertAtlasAction(before, action)).toEqual([{ type: 'removeNode', id: 'a' }]);
  });

  it('inverts reparent back to the prior (defined) parent', () => {
    const before = doc([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'a', name: 'A', parent: 'p1' },
    ]);
    const action: AtlasAction = { type: 'reparent', id: 'a', parent: 'p2' };
    expect(invertAtlasAction(before, action)).toEqual([{ type: 'reparent', id: 'a', parent: 'p1' }]);
  });

  it('inverts reparent back to root (no prior parent)', () => {
    const before = doc([
      { id: 'p', name: 'P' },
      { id: 'a', name: 'A' },
    ]);
    const action: AtlasAction = { type: 'reparent', id: 'a', parent: 'p' };
    expect(invertAtlasAction(before, action)).toEqual([{ type: 'reparent', id: 'a' }]);
  });

  it('inverts setNode with the same keys, valued from before', () => {
    const before = doc([{ id: 'a', name: 'A', x: 1, y: 2 }]);
    const action: AtlasAction = { type: 'setNode', id: 'a', x: 10, y: 20 };
    expect(invertAtlasAction(before, action)).toEqual([{ type: 'setNode', id: 'a', x: 1, y: 2 }]);
  });

  it('inverts a field-deletion setNode by restoring absence as an explicit undefined', () => {
    const before = doc([{ id: 'a', name: 'A' }]);
    const action: AtlasAction = { type: 'setNode', id: 'a', color: 'accent-8' };
    const inverse = invertAtlasAction(before, action);
    expect(inverse).toEqual([{ type: 'setNode', id: 'a', color: undefined }]);
    expect(inverse[0]).toHaveProperty('color');
  });

  it('inverts a content height setNode by restoring the prior value', () => {
    const before = doc([{ id: 'a', name: 'A', contentHeight: 100 }]);
    const action: AtlasAction = { type: 'setNode', id: 'a', contentHeight: 200 };
    expect(invertAtlasAction(before, action)).toEqual([{ type: 'setNode', id: 'a', contentHeight: 100 }]);
  });

  it('throws for removeNode', () => {
    const before = doc([{ id: 'a', name: 'A' }]);
    const action: AtlasAction = { type: 'removeNode', id: 'a' };
    expect(() => invertAtlasAction(before, action)).toThrow();
  });

  it('inverts addEdge into a matching removeEdge', () => {
    const before = doc([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    const action: AtlasAction = { type: 'addEdge', from: 'a', to: 'b' };
    expect(invertAtlasAction(before, action)).toEqual([{ type: 'removeEdge', from: 'a', to: 'b' }]);
  });

  it('inverts removeEdge into a matching addEdge', () => {
    const before = doc([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [{ from: 'a', to: 'b' }]);
    const action: AtlasAction = { type: 'removeEdge', from: 'a', to: 'b' };
    expect(invertAtlasAction(before, action)).toEqual([{ type: 'addEdge', from: 'a', to: 'b' }]);
  });
});

describe('invertAtlasBatch', () => {
  it('round-trips a single addNode', () => {
    const before = doc([]);
    roundTrips(before, [{ type: 'addNode', id: 'a', name: 'A', x: 1, y: 2 }]);
  });

  it('round-trips a single reparent', () => {
    const before = doc([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'a', name: 'A', parent: 'p1' },
    ]);
    roundTrips(before, [{ type: 'reparent', id: 'a', parent: 'p2' }]);
  });

  it('round-trips setNode fields, including field-deletion (content, color, x/y, contentHeight)', () => {
    const before = doc([
      { id: 'a', name: 'A', content: { text: 'hi', mode: 'markdown' }, color: 'accent-8', x: 1, y: 2, contentHeight: 100 },
    ]);
    roundTrips(before, [
      { type: 'setNode', id: 'a', content: undefined, color: undefined, x: undefined, y: undefined, contentHeight: undefined },
    ]);
  });

  it('round-trips setNode name', () => {
    const before = doc([{ id: 'a', name: 'A' }]);
    roundTrips(before, [{ type: 'setNode', id: 'a', name: 'Renamed' }]);
  });

  it('round-trips a multi-action batch in reverse order, folding forward through intermediate state', () => {
    const before = doc([{ id: 'p', name: 'P' }]);
    const actions: AtlasAction[] = [
      { type: 'addNode', id: 'a', name: 'A', x: 0, y: 0 },
      { type: 'reparent', id: 'a', parent: 'p' },
      { type: 'setNode', id: 'a', x: 50, y: 60 },
    ];
    const inverse = invertAtlasBatch(before, actions);
    expect(inverse).toEqual([
      { type: 'setNode', id: 'a', x: 0, y: 0 },
      { type: 'reparent', id: 'a' },
      { type: 'removeNode', id: 'a' },
    ]);
    roundTrips(before, actions);
  });

  it('round-trips a single addEdge', () => {
    const before = doc([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    roundTrips(before, [{ type: 'addEdge', from: 'a', to: 'b' }]);
  });

  it('round-trips a single removeEdge', () => {
    const before = doc([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [{ from: 'a', to: 'b' }]);
    roundTrips(before, [{ type: 'removeEdge', from: 'a', to: 'b' }]);
  });

  it('inverts a bisect batch back to the original single edge, with the new node gone', () => {
    const before = doc([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [{ from: 'a', to: 'b' }]);
    const actions = buildBisectActions(before, { from: 'a', to: 'b' }, { id: 'n', name: 'N' });
    const applied = applyAtlasBatch(before, actions);
    if (!applied.ok) throw new Error(`setup: ${applied.error}`);
    expect(applied.doc.nodes.map((n) => n.id)).toEqual(['a', 'b', 'n']);

    roundTrips(before, actions);
    const inverse = invertAtlasBatch(before, actions);
    const restored = applyAtlasBatch(applied.doc, inverse);
    if (!restored.ok) throw new Error(`undo: ${restored.error}`);
    expect(restored.doc.nodes.some((n) => n.id === 'n')).toBe(false);
  });
});
