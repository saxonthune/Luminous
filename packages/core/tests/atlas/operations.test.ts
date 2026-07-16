import { describe, it, expect } from 'vitest';
import { addNode, applyAtlasBatch, removeNode, reparent, setNode } from '../../src/atlas/operations.ts';
import { emptyAtlasDocument } from '../../src/atlas/document.ts';
import type { AtlasDocument } from '../../src/atlas/types.ts';

describe('addNode', () => {
  it('adds a root node', () => {
    const result = addNode(emptyAtlasDocument(), { id: 'a', name: 'A' });
    expect(result).toEqual({ ok: true, doc: { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] } });
  });

  it('adds a node under an existing parent', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = addNode(doc, { id: 'b', name: 'B', parent: 'a' });
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }], edges: [] },
    });
  });

  it('errors when the id already exists', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = addNode(doc, { id: 'a', name: 'A2' });
    expect(result).toEqual({ ok: false, error: 'node "a" already exists' });
  });

  it('errors when the parent does not exist', () => {
    const result = addNode(emptyAtlasDocument(), { id: 'a', name: 'A', parent: 'missing' });
    expect(result).toEqual({ ok: false, error: 'parent "missing" does not exist' });
  });

  it('does not mutate the input document', () => {
    const doc = emptyAtlasDocument();
    addNode(doc, { id: 'a', name: 'A' });
    expect(doc.nodes).toEqual([]);
  });

  it('carries a position', () => {
    const result = addNode(emptyAtlasDocument(), { id: 'a', name: 'A', x: 10, y: 20 });
    expect(result).toEqual({ ok: true, doc: { v: 1, nodes: [{ id: 'a', name: 'A', x: 10, y: 20 }], edges: [] } });
  });
});

describe('setNode', () => {
  const base: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };

  it('updates the name', () => {
    const result = setNode(base, 'a', { name: 'New Name' });
    expect(result).toEqual({ ok: true, doc: { v: 1, nodes: [{ id: 'a', name: 'New Name' }], edges: [] } });
  });

  it('sets content', () => {
    const result = setNode(base, 'a', { content: { text: 'hi', mode: 'markdown' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0].content).toEqual({ text: 'hi', mode: 'markdown' });
  });

  it('clears content when explicitly set to undefined', () => {
    const withContent: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'hi', mode: 'markdown' } }],
      edges: [],
    };
    const result = setNode(withContent, 'a', { content: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0].content).toBeUndefined();
  });

  it('leaves content untouched when not present in the patch', () => {
    const withContent: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'hi', mode: 'markdown' } }],
      edges: [],
    };
    const result = setNode(withContent, 'a', { name: 'Renamed' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0].content).toEqual({ text: 'hi', mode: 'markdown' });
  });

  it('errors when the node does not exist', () => {
    const result = setNode(base, 'missing', { name: 'X' });
    expect(result).toEqual({ ok: false, error: 'node "missing" does not exist' });
  });

  it('does not mutate the input document', () => {
    setNode(base, 'a', { name: 'Changed' });
    expect(base.nodes[0].name).toBe('A');
  });

  it('sets a position', () => {
    const result = setNode(base, 'a', { x: 1, y: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toEqual({ id: 'a', name: 'A', x: 1, y: 2 });
  });

  it('clears a position when explicitly set to undefined', () => {
    const withPosition: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', x: 1, y: 2 }], edges: [] };
    const result = setNode(withPosition, 'a', { x: undefined, y: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.nodes[0].x).toBeUndefined();
      expect(result.doc.nodes[0].y).toBeUndefined();
    }
  });

  it('leaves an existing position untouched when the patch carries only name', () => {
    const withPosition: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', x: 1, y: 2 }], edges: [] };
    const result = setNode(withPosition, 'a', { name: 'Renamed' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toEqual({ id: 'a', name: 'Renamed', x: 1, y: 2 });
  });
});

describe('removeNode', () => {
  it('errors when the node does not exist', () => {
    const result = removeNode(emptyAtlasDocument(), 'missing');
    expect(result).toEqual({ ok: false, error: 'node "missing" does not exist' });
  });

  it('removes a leaf node with no descendants or edges', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = removeNode(doc, 'a');
    expect(result).toEqual({ ok: true, doc: { v: 1, nodes: [], edges: [] } });
  });

  it('cascades to descendants and their edges', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parent: 'a' },
        { id: 'c', name: 'C', parent: 'b' },
        { id: 'd', name: 'D' },
      ],
      edges: [
        { from: 'a', to: 'd' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'd' },
      ],
    };
    const result = removeNode(doc, 'a');
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'd', name: 'D' }], edges: [{ from: 'd', to: 'd' }] },
    });
  });

  it('removes edges touching only the removed node', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = removeNode(doc, 'a');
    expect(result).toEqual({ ok: true, doc: { v: 1, nodes: [{ id: 'b', name: 'B' }], edges: [] } });
  });
});

describe('reparent', () => {
  it('sets a parent on a root node', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      edges: [],
    };
    const result = reparent(doc, 'b', 'a');
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }], edges: [] },
    });
  });

  it('clears the parent when given undefined', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }],
      edges: [],
    };
    const result = reparent(doc, 'b', undefined);
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], edges: [] },
    });
  });

  it('errors when the node does not exist', () => {
    const result = reparent(emptyAtlasDocument(), 'missing', undefined);
    expect(result).toEqual({ ok: false, error: 'node "missing" does not exist' });
  });

  it('errors when the parent does not exist', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = reparent(doc, 'a', 'missing');
    expect(result).toEqual({ ok: false, error: 'parent "missing" does not exist' });
  });

  it('rejects self-parenting', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = reparent(doc, 'a', 'a');
    expect(result).toEqual({ ok: false, error: 'node "a" cannot be its own parent' });
  });

  it('rejects a cycle', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parent: 'a' },
        { id: 'c', name: 'C', parent: 'b' },
      ],
      edges: [],
    };
    const result = reparent(doc, 'a', 'c');
    expect(result).toEqual({ ok: false, error: 'reparenting "a" to "c" would create a cycle' });
  });
});

describe('applyAtlasBatch', () => {
  it('applies actions in order', () => {
    const result = applyAtlasBatch(emptyAtlasDocument(), [
      { type: 'addNode', id: 'a', name: 'A' },
      { type: 'addNode', id: 'b', name: 'B', parent: 'a' },
      { type: 'setNode', id: 'b', name: 'B2' },
    ]);
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B2', parent: 'a' }], edges: [] },
    });
  });

  it('is atomic: a failing action discards the whole batch', () => {
    const original = emptyAtlasDocument();
    const result = applyAtlasBatch(original, [
      { type: 'addNode', id: 'a', name: 'A' },
      { type: 'addNode', id: 'b', name: 'B', parent: 'missing' },
      { type: 'addNode', id: 'c', name: 'C' },
    ]);
    expect(result).toEqual({ ok: false, error: 'parent "missing" does not exist' });
    expect(original).toEqual({ v: 1, nodes: [], edges: [] });
  });
});
