import { describe, it, expect } from 'vitest';
import {
  addEdge,
  addNode,
  applyAtlasBatch,
  buildBisectActions,
  removeEdge,
  removeNode,
  reparent,
  setLegend,
  setNode,
} from '../../src/atlas/operations.ts';
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

  it('preserves an existing "from" when a content patch does not mention it', () => {
    const withFrom: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'hi', mode: 'markdown', from: 'cli.build' } }],
      edges: [],
    };
    const result = setNode(withFrom, 'a', { content: { text: 'bye', mode: 'code' } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.nodes[0].content).toEqual({ text: 'bye', mode: 'code', from: 'cli.build' });
    }
  });

  it('clears "from" when a content patch sets it to undefined explicitly', () => {
    const withFrom: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'hi', mode: 'markdown', from: 'cli.build' } }],
      edges: [],
    };
    const result = setNode(withFrom, 'a', { content: { text: 'hi', mode: 'markdown', from: undefined } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.nodes[0].content).toEqual({ text: 'hi', mode: 'markdown' });
    }
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

  it('sets a color', () => {
    const result = setNode(base, 'a', { color: 'accent-2' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0].color).toBe('accent-2');
  });

  it('clears a color when explicitly set to undefined', () => {
    const withColor: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', color: 'accent-2' }], edges: [] };
    const result = setNode(withColor, 'a', { color: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0].color).toBeUndefined();
  });

  it('leaves an existing color untouched when the patch carries only name', () => {
    const withColor: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', color: 'accent-2' }], edges: [] };
    const result = setNode(withColor, 'a', { name: 'Renamed' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toEqual({ id: 'a', name: 'Renamed', color: 'accent-2' });
  });

  it('sets a content height', () => {
    const result = setNode(base, 'a', { contentHeight: 150 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toEqual({ id: 'a', name: 'A', contentHeight: 150 });
  });

  it('clears a content height when explicitly set to undefined', () => {
    const withHeight: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentHeight: 150 }], edges: [] };
    const result = setNode(withHeight, 'a', { contentHeight: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0].contentHeight).toBeUndefined();
  });

  it('leaves an existing content height untouched when the patch carries only name', () => {
    const withHeight: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentHeight: 150 }], edges: [] };
    const result = setNode(withHeight, 'a', { name: 'Renamed' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toEqual({ id: 'a', name: 'Renamed', contentHeight: 150 });
  });

  it('sets a content width', () => {
    const result = setNode(base, 'a', { contentWidth: 300 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toEqual({ id: 'a', name: 'A', contentWidth: 300 });
  });

  it('clears a content width when explicitly set to undefined', () => {
    const withWidth: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentWidth: 300 }], edges: [] };
    const result = setNode(withWidth, 'a', { contentWidth: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0].contentWidth).toBeUndefined();
  });

  it('leaves an existing content width untouched when the patch carries only name', () => {
    const withWidth: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentWidth: 300 }], edges: [] };
    const result = setNode(withWidth, 'a', { name: 'Renamed' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toEqual({ id: 'a', name: 'Renamed', contentWidth: 300 });
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

  it('R56: strips edges between the node and its new parent, both directions', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
        { from: 'b', to: 'c' },
      ],
    };
    const result = reparent(doc, 'b', 'a');
    expect(result.ok && result.doc.edges).toEqual([{ from: 'b', to: 'c' }]);
  });

  it('R56: strips every pair the move relates — moved subtree against the new ancestor chain', () => {
    // Moving `sub` (with child `leaf`) into `inner` (inside `outer`) strips
    // the leaf-to-outer edge too; the sibling edge survives.
    const doc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'outer', name: 'Outer' },
        { id: 'inner', name: 'Inner', parent: 'outer' },
        { id: 'sub', name: 'Sub' },
        { id: 'leaf', name: 'Leaf', parent: 'sub' },
        { id: 'peer', name: 'Peer' },
      ],
      edges: [
        { from: 'leaf', to: 'outer' },
        { from: 'sub', to: 'peer' },
      ],
    };
    const result = reparent(doc, 'sub', 'inner');
    expect(result.ok && result.doc.edges).toEqual([{ from: 'sub', to: 'peer' }]);
  });

  it('R56: ungrouping strips nothing', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }, { id: 'c', name: 'C' }],
      edges: [{ from: 'b', to: 'c' }],
    };
    const result = reparent(doc, 'b', undefined);
    expect(result.ok && result.doc.edges).toEqual([{ from: 'b', to: 'c' }]);
  });
});

describe('addEdge', () => {
  const base: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], edges: [] };

  it('adds an edge between existing nodes', () => {
    const result = addEdge(base, 'a', 'b');
    expect(result).toEqual({ ok: true, doc: { ...base, edges: [{ from: 'a', to: 'b' }] } });
  });

  it('is idempotent when the pair already exists', () => {
    const withEdge: AtlasDocument = { ...base, edges: [{ from: 'a', to: 'b' }] };
    const result = addEdge(withEdge, 'a', 'b');
    expect(result).toEqual({ ok: true, doc: withEdge });
  });

  it('errors when "from" does not exist', () => {
    const result = addEdge(base, 'missing', 'b');
    expect(result).toEqual({ ok: false, error: 'node "missing" does not exist' });
  });

  it('errors when "to" does not exist', () => {
    const result = addEdge(base, 'a', 'missing');
    expect(result).toEqual({ ok: false, error: 'node "missing" does not exist' });
  });

  it('R55: refuses an edge between a parent and its child, both directions', () => {
    const nested: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }],
      edges: [],
    };
    expect(addEdge(nested, 'a', 'b')).toEqual({
      ok: false,
      error: 'no edge between "a" and "b": one contains the other',
    });
    expect(addEdge(nested, 'b', 'a')).toEqual({
      ok: false,
      error: 'no edge between "b" and "a": one contains the other',
    });
  });

  it('R55: refuses an edge anywhere in the ancestor chain; uncles and siblings are fine', () => {
    const nested: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parent: 'a' },
        { id: 'c', name: 'C', parent: 'b' },
        { id: 'uncle', name: 'Uncle', parent: 'a' },
        { id: 'root2', name: 'Root2' },
      ],
      edges: [],
    };
    expect(addEdge(nested, 'a', 'c').ok).toBe(false);
    expect(addEdge(nested, 'c', 'a').ok).toBe(false);
    expect(addEdge(nested, 'uncle', 'c').ok).toBe(true);
    expect(addEdge(nested, 'b', 'uncle').ok).toBe(true);
    expect(addEdge(nested, 'root2', 'c').ok).toBe(true);
  });
});

describe('removeEdge', () => {
  const withEdge: AtlasDocument = {
    v: 1,
    nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    edges: [{ from: 'a', to: 'b' }],
  };

  it('removes the matching pair', () => {
    const result = removeEdge(withEdge, 'a', 'b');
    expect(result).toEqual({ ok: true, doc: { ...withEdge, edges: [] } });
  });

  it('is a no-op when the pair does not exist', () => {
    const noEdge: AtlasDocument = { ...withEdge, edges: [] };
    const result = removeEdge(noEdge, 'a', 'b');
    expect(result).toEqual({ ok: true, doc: noEdge });
  });

  it('errors when a node does not exist', () => {
    const result = removeEdge(withEdge, 'a', 'missing');
    expect(result).toEqual({ ok: false, error: 'node "missing" does not exist' });
  });
});

describe('buildBisectActions', () => {
  it('turns A -> B into A -> N -> B via applyAtlasBatch', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      edges: [{ from: 'a', to: 'b' }],
    };
    const actions = buildBisectActions(doc, { from: 'a', to: 'b' }, { id: 'n', name: 'N' });
    const result = applyAtlasBatch(doc, actions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.nodes.map((n) => n.id)).toEqual(['a', 'b', 'n']);
    expect(result.doc.edges).toEqual([{ from: 'a', to: 'n' }, { from: 'n', to: 'b' }]);
  });

  it('carries content onto the new node', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      edges: [{ from: 'a', to: 'b' }],
    };
    const actions = buildBisectActions(doc, { from: 'a', to: 'b' }, {
      id: 'n',
      name: 'N',
      content: { text: 'explanation', mode: 'markdown' },
    });
    const result = applyAtlasBatch(doc, actions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.nodes.find((n) => n.id === 'n')?.content).toEqual({ text: 'explanation', mode: 'markdown' });
  });
});

describe('Container Ports', () => {
  const containerDoc: AtlasDocument = { v: 1, nodes: [
    { id: 'box', name: 'Box' }, { id: 'child', name: 'Child', parent: 'box' },
  ], edges: [] };

  it('sets, replaces, and clears the whole Ports record', () => {
    const set = applyAtlasBatch(containerDoc, [{ type: 'setNode', id: 'box', ports: { entry: { side: 'top', offset: 0.25 } } }]);
    expect(set.ok && set.doc.nodes[0].ports).toEqual({ entry: { side: 'top', offset: 0.25 } });
    if (!set.ok) return;
    const clear = applyAtlasBatch(set.doc, [{ type: 'setNode', id: 'box', ports: undefined }]);
    expect(clear.ok && clear.doc.nodes[0]).not.toHaveProperty('ports');
  });

  it('removes dormant placements when reparent or removal takes the last Child', () => {
    const withPorts: AtlasDocument = { ...containerDoc, nodes: [
      { ...containerDoc.nodes[0], ports: { exit: { side: 'right', offset: 0.5 } } }, containerDoc.nodes[1],
    ] };
    const moved = applyAtlasBatch(withPorts, [{ type: 'reparent', id: 'child' }]);
    expect(moved.ok && moved.doc.nodes[0]).not.toHaveProperty('ports');
    const removed = applyAtlasBatch(withPorts, [{ type: 'removeNode', id: 'child' }]);
    expect(removed.ok && removed.doc.nodes[0]).not.toHaveProperty('ports');
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

  it('carries a color through a setNode action', () => {
    const result = applyAtlasBatch(emptyAtlasDocument(), [
      { type: 'addNode', id: 'a', name: 'A' },
      { type: 'setNode', id: 'a', color: 'accent-2' },
    ]);
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A', color: 'accent-2' }], edges: [] },
    });
  });

  it('carries a content height through a setNode action', () => {
    const result = applyAtlasBatch(emptyAtlasDocument(), [
      { type: 'addNode', id: 'a', name: 'A' },
      { type: 'setNode', id: 'a', contentHeight: 150 },
    ]);
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A', contentHeight: 150 }], edges: [] },
    });
  });

  it('carries a content width through a setNode action', () => {
    const result = applyAtlasBatch(emptyAtlasDocument(), [
      { type: 'addNode', id: 'a', name: 'A' },
      { type: 'setNode', id: 'a', contentWidth: 300 },
    ]);
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A', contentWidth: 300 }], edges: [] },
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

  it('applies a setLegend action', () => {
    const result = applyAtlasBatch(emptyAtlasDocument(), [
      { type: 'setLegend', legend: { 'accent-1': 'user-facing interface' } },
    ]);
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, legend: { 'accent-1': 'user-facing interface' }, nodes: [], edges: [] },
    });
  });
});

describe('setLegend', () => {
  it('replaces the whole legend', () => {
    const doc: AtlasDocument = { v: 1, legend: { 'accent-1': 'old', 'accent-2': 'kept?' }, nodes: [], edges: [] };
    const result = setLegend(doc, { 'accent-1': 'new' });
    expect(result).toEqual({ ok: true, doc: { v: 1, legend: { 'accent-1': 'new' }, nodes: [], edges: [] } });
  });

  it('clears the legend on an empty record, dropping the field', () => {
    const doc: AtlasDocument = { v: 1, legend: { 'accent-1': 'old' }, nodes: [], edges: [] };
    const result = setLegend(doc, {});
    expect(result).toEqual({ ok: true, doc: { v: 1, nodes: [], edges: [] } });
  });

  it('refuses an unrecognized color token', () => {
    const result = setLegend(emptyAtlasDocument(), { red: 'nope' } as never);
    expect(result).toEqual({ ok: false, error: 'legend: unrecognized color token "red"' });
  });
});
