import { describe, it, expect } from 'vitest';
import { emptyLinenDocument } from '../../src/linen/document.ts';
import {
  addContract,
  addModule,
  addNode,
  applyLinenBatch,
  connect,
  disconnect,
  removeNode,
  setNode,
} from '../../src/linen/operations.ts';
import type { LinenDocument } from '../../src/linen/types.ts';

function base(): LinenDocument {
  return {
    v: 1,
    modules: [
      { id: 'worker', name: 'Worker' },
      { id: 'kv', name: 'KV' },
    ],
    contracts: [{ id: 'snapshot', name: 'RenderSnapshot' }],
    nodes: [
      { id: 'start', kind: 'entry', module: 'worker' },
      { id: 'store', kind: 'pass', module: 'worker', to: 'kv' },
    ],
    edges: [{ from: 'start', to: 'store' }],
  };
}

describe('addModule', () => {
  it('adds a module and a nested module', () => {
    const first = addModule(emptyLinenDocument(), { id: 'a', name: 'A' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addModule(first.doc, { id: 'b', name: 'B', parent: 'a' });
    expect(second).toEqual({
      ok: true,
      doc: { ...first.doc, modules: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }] },
    });
  });

  it('errors on a missing parent', () => {
    expect(addModule(emptyLinenDocument(), { id: 'a', name: 'A', parent: 'ghost' }))
      .toEqual({ ok: false, error: 'parent module "ghost" does not exist' });
  });

  it('errors on an id already used by a node', () => {
    expect(addModule(base(), { id: 'start', name: 'X' }))
      .toEqual({ ok: false, error: 'id "start" already exists' });
  });
});

describe('addContract', () => {
  it('errors on an unknown owner module', () => {
    expect(addContract(emptyLinenDocument(), { id: 'c', name: 'C', owner: 'ghost' }))
      .toEqual({ ok: false, error: 'owner module "ghost" does not exist' });
  });
});

describe('addNode', () => {
  it('requires "to" on a Pass', () => {
    expect(addNode(base(), { id: 'p', kind: 'pass', module: 'worker' }))
      .toEqual({ ok: false, error: 'a Pass must name the Module passed to ("to")' });
  });

  it('rejects "to" on a non-Pass', () => {
    expect(addNode(base(), { id: 's', kind: 'switch', module: 'worker', to: 'kv' }))
      .toEqual({ ok: false, error: 'only a Pass names a Module passed to ("to")' });
  });

  it('rejects an unknown kind with the allowed list', () => {
    const result = addNode(base(), { id: 'w', kind: 'widget', module: 'worker' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('entry, filter, switch');
  });

  it('adds a Type naming a Contract', () => {
    const result = addNode(base(), { id: 't', kind: 'type', module: 'worker', contract: 'snapshot' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.nodes.at(-1)).toEqual({ id: 't', kind: 'type', module: 'worker', contract: 'snapshot' });
    }
  });
});

describe('setNode', () => {
  it('sets and deletes the annotation', () => {
    const set = setNode(base(), 'start', { annotation: 'alarm fires' });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    expect(set.doc.nodes[0].annotation).toBe('alarm fires');
    const cleared = setNode(set.doc, 'start', { annotation: undefined });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.doc.nodes[0]).toEqual({ id: 'start', kind: 'entry', module: 'worker' });
  });

  it('retargets a Pass and rejects retargeting a non-Pass', () => {
    const doc = base();
    const moved = setNode(doc, 'store', { to: 'worker' });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.doc.nodes[1]).toMatchObject({ to: 'worker' });
    expect(setNode(doc, 'start', { to: 'kv' }))
      .toEqual({ ok: false, error: 'node "start" is not a Pass and has no "to"' });
  });

  it('moves a node with x and y together', () => {
    const result = setNode(base(), 'start', { x: 5, y: 7 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.nodes[0]).toMatchObject({ x: 5, y: 7 });
  });
});

describe('removeNode', () => {
  it('removes the node and cascades its edges', () => {
    const result = removeNode(base(), 'store');
    expect(result).toEqual({
      ok: true,
      doc: { ...base(), nodes: [{ id: 'start', kind: 'entry', module: 'worker' }], edges: [] },
    });
  });
});

describe('connect', () => {
  it('connects two Trace Nodes and a Module to a Contract', () => {
    const doc = base();
    expect(connect(doc, 'kv', 'snapshot').ok).toBe(true);
    expect(connect(doc, 'store', 'snapshot').ok).toBe(true);
  });

  it('rejects a Contract as source and a Module as target', () => {
    const doc = base();
    expect(connect(doc, 'snapshot', 'start').ok).toBe(false);
    expect(connect(doc, 'start', 'kv').ok).toBe(false);
  });

  it('rejects a duplicate edge', () => {
    expect(connect(base(), 'start', 'store'))
      .toEqual({ ok: false, error: 'edge "start" -> "store" already exists' });
  });

  it('rejects an unknown endpoint', () => {
    expect(connect(base(), 'start', 'ghost')).toEqual({ ok: false, error: '"ghost" does not exist' });
  });
});

describe('disconnect', () => {
  it('removes an edge and errors on a missing one', () => {
    const result = disconnect(base(), 'start', 'store');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.edges).toEqual([]);
    expect(disconnect(base(), 'store', 'start'))
      .toEqual({ ok: false, error: 'edge "store" -> "start" does not exist' });
  });
});

describe('applyLinenBatch', () => {
  it('builds a small document from actions', () => {
    const result = applyLinenBatch(emptyLinenDocument(), [
      { type: 'addModule', id: 'm', name: 'M' },
      { type: 'addContract', id: 'c', name: 'C', owner: 'm' },
      { type: 'addNode', id: 'e', kind: 'entry', module: 'm' },
      { type: 'addNode', id: 'p', kind: 'pass', module: 'm', to: 'm' },
      { type: 'connect', from: 'e', to: 'p' },
      { type: 'connect', from: 'm', to: 'c' },
      { type: 'setAnnotation', id: 'e', annotation: 'request arrives' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.nodes[0].annotation).toBe('request arrives');
      expect(result.doc.edges).toHaveLength(2);
    }
  });

  it('stops at the first failing action', () => {
    const result = applyLinenBatch(emptyLinenDocument(), [
      { type: 'addModule', id: 'm', name: 'M' },
      { type: 'connect', from: 'm', to: 'ghost' },
      { type: 'addModule', id: 'n', name: 'N' },
    ]);
    expect(result).toEqual({ ok: false, error: '"ghost" does not exist' });
  });
});
