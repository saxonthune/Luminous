import { describe, it, expect } from 'vitest';
import {
  emptyMerinoDocument,
  parseMerinoDocument,
  serializeMerinoDocument,
  addNode,
  setNode,
  removeNode,
  connect,
  setEdge,
  disconnect,
  addNodeType,
  removeNodeType,
  checkMerinoDocument,
  applyMerinoBatch,
} from '../../src/merino/index.ts';
import type { MerinoDocument } from '../../src/merino/index.ts';

function seeded(): MerinoDocument {
  return emptyMerinoDocument();
}

function unwrap(r: { ok: true; doc: MerinoDocument } | { ok: false; error: string }): MerinoDocument {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
}

describe('merino document', () => {
  it('seeds the starter node and edge types', () => {
    const doc = seeded();
    expect(doc.nodeTypes.map(t => t.id)).toEqual(['event', 'requirement', 'resource', 'deployment']);
    expect(doc.edgeTypes.map(t => t.id)).toEqual(['triggers', 'needs']);
  });

  it('round-trips through serialize and parse', () => {
    let doc = seeded();
    doc = unwrap(addNode(doc, { id: 'load', tab: 'requirements', nodeType: 'event', name: 'On load', x: 0, y: 0 }));
    doc = unwrap(addNode(doc, { id: 'map', tab: 'requirements', nodeType: 'requirement', name: 'Map loads', x: 200, y: 0 }));
    doc = unwrap(connect(doc, { id: 'e1', edgeType: 'triggers', from: 'load', to: 'map' }));
    const text = serializeMerinoDocument(doc);
    const parsed = parseMerinoDocument(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.doc).toEqual(doc);
  });
});

describe('merino nodes and subnodes', () => {
  it('removing a node cascades to its subnodes and incident edges', () => {
    let doc = seeded();
    doc = unwrap(addNode(doc, { id: 'a', tab: 'requirements', nodeType: 'event', name: 'A' }));
    doc = unwrap(addNode(doc, { id: 'b', tab: 'requirements', nodeType: 'requirement', name: 'B', parent: 'a' }));
    doc = unwrap(addNode(doc, { id: 'c', tab: 'requirements', nodeType: 'resource', name: 'C' }));
    doc = unwrap(connect(doc, { id: 'e1', edgeType: 'triggers', from: 'a', to: 'c' }));
    doc = unwrap(connect(doc, { id: 'e2', edgeType: 'needs', from: 'b', to: 'c' }));
    doc = unwrap(removeNode(doc, 'a'));
    expect(doc.nodes.map(n => n.id)).toEqual(['c']);
    expect(doc.edges).toEqual([]);
  });

  it('rejects a subnode whose parent is on another tab', () => {
    let doc = seeded();
    doc = unwrap(addNode(doc, { id: 'a', tab: 'requirements', nodeType: 'event', name: 'A' }));
    const r = addNode(doc, { id: 'b', tab: 'deployments', nodeType: 'resource', name: 'B', parent: 'a' });
    expect(r.ok).toBe(false);
  });
});

describe('merino edges stay within a tab', () => {
  it('refuses to connect across tabs', () => {
    let doc = seeded();
    doc = unwrap(addNode(doc, { id: 'a', tab: 'requirements', nodeType: 'event', name: 'A' }));
    doc = unwrap(addNode(doc, { id: 'd', tab: 'deployments', nodeType: 'deployment', name: 'D' }));
    const r = connect(doc, { id: 'e1', edgeType: 'triggers', from: 'a', to: 'd' });
    expect(r.ok).toBe(false);
  });

  it('changes and removes an edge by id', () => {
    let doc = seeded();
    doc = unwrap(addNode(doc, { id: 'a', tab: 'requirements', nodeType: 'event', name: 'A' }));
    doc = unwrap(addNode(doc, { id: 'b', tab: 'requirements', nodeType: 'requirement', name: 'B' }));
    doc = unwrap(connect(doc, { id: 'e1', edgeType: 'triggers', from: 'a', to: 'b' }));
    doc = unwrap(setEdge(doc, 'e1', 'needs'));
    expect(doc.edges[0].type).toBe('needs');
    doc = unwrap(disconnect(doc, 'e1'));
    expect(doc.edges).toEqual([]);
  });
});

describe('merino progressive disclosure', () => {
  it('toggles the expanded flag and clears it when collapsed', () => {
    let doc = seeded();
    doc = unwrap(addNode(doc, { id: 'a', tab: 'requirements', nodeType: 'event', name: 'A' }));
    expect(doc.nodes[0].expanded).toBeUndefined();
    doc = unwrap(setNode(doc, 'a', { expanded: true }));
    expect(doc.nodes[0].expanded).toBe(true);
    const text = serializeMerinoDocument(doc);
    expect(JSON.parse(text).nodes[0].expanded).toBe(true);
    doc = unwrap(setNode(doc, 'a', { expanded: false }));
    expect(doc.nodes[0].expanded).toBeUndefined();
    expect(JSON.parse(serializeMerinoDocument(doc)).nodes[0]).not.toHaveProperty('expanded');
  });
});

describe('merino type registries', () => {
  it('refuses to remove a node type still in use', () => {
    let doc = seeded();
    doc = unwrap(addNode(doc, { id: 'a', tab: 'requirements', nodeType: 'event', name: 'A' }));
    const r = removeNodeType(doc, 'event');
    expect(r.ok).toBe(false);
  });

  it('adds a node type and uses it', () => {
    let doc = seeded();
    doc = unwrap(addNodeType(doc, { id: 'ui-state', name: 'UI State', color: 'accent-5' }));
    doc = unwrap(addNode(doc, { id: 'a', tab: 'requirements', nodeType: 'ui-state', name: 'Homepage' }));
    expect(doc.nodes[0].type).toBe('ui-state');
  });
});

describe('merino check', () => {
  it('flags a dangling edge and an out-of-registry type', () => {
    const doc: MerinoDocument = {
      v: 1,
      nodeTypes: [{ id: 'event', name: 'Event', color: 'accent-4' }],
      edgeTypes: [{ id: 'triggers', name: 'triggers', color: 'accent-4', dash: 'solid', arrowHead: true, directed: true }],
      nodes: [{ id: 'a', tab: 'requirements', type: 'ghost', name: 'A' }],
      edges: [{ id: 'e1', tab: 'requirements', type: 'triggers', from: 'a', to: 'missing' }],
    };
    const errors = checkMerinoDocument(doc).filter(i => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('applies a batch atomically, rolling back on a bad action', () => {
    const doc = seeded();
    const r = applyMerinoBatch(doc, [
      { type: 'addNode', id: 'a', tab: 'requirements', nodeType: 'event', name: 'A' },
      { type: 'addNode', id: 'a', tab: 'requirements', nodeType: 'event', name: 'dup' },
    ]);
    expect(r.ok).toBe(false);
  });
});
