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
  setNodeType,
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

  it('gives a node type a layout, round-trips it, retypes it, and clears it', () => {
    let doc = seeded();
    doc = unwrap(addNodeType(doc, { id: 'screen', name: 'Screen', color: 'accent-1', layout: 'container' }));
    expect(doc.nodeTypes.find(t => t.id === 'screen')?.layout).toBe('container');
    const parsed = parseMerinoDocument(serializeMerinoDocument(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.doc.nodeTypes.find(t => t.id === 'screen')?.layout).toBe('container');
    doc = unwrap(setNodeType(doc, 'screen', { layout: 'list' }));
    expect(doc.nodeTypes.find(t => t.id === 'screen')?.layout).toBe('list');
    doc = unwrap(setNodeType(doc, 'screen', { layout: null }));
    expect(doc.nodeTypes.find(t => t.id === 'screen')).not.toHaveProperty('layout');
    expect(JSON.parse(serializeMerinoDocument(doc)).nodeTypes.find((t: { id: string }) => t.id === 'screen')).not.toHaveProperty('layout');
  });

  it('round-trips agent guidance on the document, a type, and a node', () => {
    let doc = seeded();
    doc = { ...doc, agentGuidance: 'Keep requirement-chain rules on their Types.' };
    doc = unwrap(addNodeType(doc, { id: 'guided', name: 'Guided', color: 'accent-1', agentGuidance: 'Use only for examples.' }));
    doc = unwrap(addNode(doc, { id: 'instance', tab: 'requirements', nodeType: 'guided', name: 'Instance', agentGuidance: 'This one models the leaderboard.' }));
    const parsed = parseMerinoDocument(serializeMerinoDocument(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.agentGuidance).toContain('requirement-chain');
      expect(parsed.doc.nodeTypes.find(t => t.id === 'guided')?.agentGuidance).toContain('examples');
      expect(parsed.doc.nodes[0]?.agentGuidance).toContain('leaderboard');
    }
  });

  it('stores and clears a list child order', () => {
    let doc = seeded();
    doc = unwrap(addNodeType(doc, { id: 'action', name: 'Action', color: 'accent-3', layout: 'list' }));
    doc = unwrap(addNode(doc, { id: 'act', tab: 'requirements', nodeType: 'action', name: 'Press' }));
    doc = unwrap(addNode(doc, { id: 'step', tab: 'requirements', nodeType: 'requirement', name: 'Transition', parent: 'act', order: 0 }));
    expect(doc.nodes.find(n => n.id === 'step')?.order).toBe(0);
    const parsed = parseMerinoDocument(serializeMerinoDocument(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.doc.nodes.find(n => n.id === 'step')?.order).toBe(0);
    doc = unwrap(setNode(doc, 'step', { order: undefined }));
    expect(doc.nodes.find(n => n.id === 'step')).not.toHaveProperty('order');
  });

  it('sets, round-trips, and clears a node’s boundary ports', () => {
    let doc = seeded();
    doc = unwrap(addNodeType(doc, { id: 'screen', name: 'Screen', color: 'accent-1', layout: 'container' }));
    doc = unwrap(addNode(doc, { id: 'box', tab: 'requirements', nodeType: 'screen', name: 'Box', x: 0, y: 0 }));
    doc = unwrap(setNode(doc, 'box', { ports: { entry: { side: 'top', offset: 0.25 }, exit: { side: 'bottom', offset: 0.75 } } }));
    expect(doc.nodes.find(n => n.id === 'box')?.ports).toEqual({ entry: { side: 'top', offset: 0.25 }, exit: { side: 'bottom', offset: 0.75 } });
    const parsed = parseMerinoDocument(serializeMerinoDocument(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.doc.nodes.find(n => n.id === 'box')?.ports?.exit).toEqual({ side: 'bottom', offset: 0.75 });
    doc = unwrap(setNode(doc, 'box', { ports: undefined }));
    expect(doc.nodes.find(n => n.id === 'box')).not.toHaveProperty('ports');
  });

  it('rejects a port with an invalid side', () => {
    const bad = JSON.stringify({
      v: 2,
      nodeTypes: [{ id: 'screen', name: 'Screen', color: 'accent-1', layout: 'container' }],
      edgeTypes: [],
      nodes: [{ id: 'box', tab: 'requirements', type: 'screen', name: 'Box', ports: { entry: { side: 'sideways', offset: 0.5 } } }],
      edges: [],
    });
    const parsed = parseMerinoDocument(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.some(i => i.includes('side'))).toBe(true);
  });

  it('migrates a v1 container:true node type to layout:container', () => {
    const v1 = JSON.stringify({
      v: 1,
      nodeTypes: [{ id: 'screen', name: 'Screen', color: 'accent-1', container: true }],
      edgeTypes: [],
      nodes: [],
      edges: [],
    });
    const parsed = parseMerinoDocument(v1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.v).toBe(3);
      expect(parsed.doc.nodeTypes[0]?.layout).toBe('container');
      expect(parsed.doc.nodeTypes[0]).not.toHaveProperty('container');
    }
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

  it('names the failing batch action and resolves references to earlier ids', () => {
    const doc = seeded();
    const success = applyMerinoBatch(doc, [
      { type: 'addNode', id: 'parent', ref: 'breakout', tab: 'requirements', nodeType: 'event', name: 'Breakout' },
      { type: 'addNode', id: 'child', tab: 'requirements', nodeType: 'requirement', name: 'Child', parent: '$ref:breakout' },
    ]);
    expect(success.ok).toBe(true);
    if (success.ok) expect(success.doc.nodes.find(n => n.id === 'child')?.parent).toBe('parent');

    const failure = applyMerinoBatch(doc, [
      { type: 'addNode', id: 'child', tab: 'requirements', nodeType: 'requirement', name: 'Child', parent: '$ref:later' },
    ]);
    expect(failure).toEqual({ ok: false, error: 'batch action 1 (addNode): unknown batch reference "$ref:later"' });
  });
});
