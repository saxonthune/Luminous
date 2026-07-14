import { describe, it, expect } from 'vitest';
import { addBox, applyDataflowBatch, connect, disconnect, removeBox, setBox } from '../../src/dataflow/operations.ts';
import { emptyDataflowDocument } from '../../src/dataflow/document.ts';
import type { DataflowDocument } from '../../src/dataflow/types.ts';

describe('addBox', () => {
  it('kebab-cases the name into an id', () => {
    const result = addBox(emptyDataflowDocument(), { name: 'My Box' });
    expect(result).toEqual({ ok: true, doc: { v: 1, boxes: [{ id: 'my-box', name: 'My Box' }], flows: [] } });
  });

  it('suffixes on id collision', () => {
    const doc: DataflowDocument = { v: 1, boxes: [{ id: 'box', name: 'Box' }], flows: [] };
    const result = addBox(doc, { name: 'Box' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.boxes[1].id).toBe('box-2');
  });

  it('suffixes past existing collisions', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'box', name: 'Box' }, { id: 'box-2', name: 'Box' }],
      flows: [],
    };
    const result = addBox(doc, { name: 'Box' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.boxes[2].id).toBe('box-3');
  });

  it('does not mutate the input document', () => {
    const doc = emptyDataflowDocument();
    addBox(doc, { name: 'Box' });
    expect(doc.boxes).toEqual([]);
  });

  it('carries description and contract through', () => {
    const result = addBox(emptyDataflowDocument(), {
      name: 'Box',
      description: 'desc',
      contract: { format: 'json', text: '{}' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.boxes[0].description).toBe('desc');
      expect(result.doc.boxes[0].contract).toEqual({ format: 'json', text: '{}' });
    }
  });
});

describe('setBox', () => {
  const base: DataflowDocument = { v: 1, boxes: [{ id: 'box', name: 'Box' }], flows: [] };

  it('updates only the given fields', () => {
    const result = setBox(base, 'box', { description: 'desc' });
    expect(result).toEqual({ ok: true, doc: { v: 1, boxes: [{ id: 'box', name: 'Box', description: 'desc' }], flows: [] } });
  });

  it('renaming preserves the id', () => {
    const result = setBox(base, 'box', { name: 'New Name' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.boxes[0].id).toBe('box');
      expect(result.doc.boxes[0].name).toBe('New Name');
    }
  });

  it('errors when the box does not exist', () => {
    const result = setBox(base, 'missing', { name: 'X' });
    expect(result).toEqual({ ok: false, error: 'box "missing" does not exist' });
  });

  it('does not mutate the input document', () => {
    setBox(base, 'box', { name: 'Changed' });
    expect(base.boxes[0].name).toBe('Box');
  });
});

describe('connect', () => {
  const base: DataflowDocument = {
    v: 1,
    boxes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    flows: [],
  };

  it('adds a flow between two existing boxes', () => {
    const result = connect(base, 'a', 'b');
    expect(result).toEqual({ ok: true, doc: { ...base, flows: [{ from: 'a', to: 'b' }] } });
  });

  it('errors when the from box is missing', () => {
    const result = connect(base, 'missing', 'b');
    expect(result).toEqual({ ok: false, error: 'box "missing" does not exist' });
  });

  it('errors when the to box is missing', () => {
    const result = connect(base, 'a', 'missing');
    expect(result).toEqual({ ok: false, error: 'box "missing" does not exist' });
  });

  it('errors when the exact flow already exists', () => {
    const withFlow: DataflowDocument = { ...base, flows: [{ from: 'a', to: 'b' }] };
    const result = connect(withFlow, 'a', 'b');
    expect(result).toEqual({ ok: false, error: 'flow from "a" to "b" already exists' });
  });
});

describe('disconnect', () => {
  const base: DataflowDocument = {
    v: 1,
    boxes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    flows: [{ from: 'a', to: 'b' }],
  };

  it('removes an existing flow', () => {
    const result = disconnect(base, 'a', 'b');
    expect(result).toEqual({ ok: true, doc: { ...base, flows: [] } });
  });

  it('errors when the flow does not exist', () => {
    const result = disconnect(base, 'b', 'a');
    expect(result).toEqual({ ok: false, error: 'flow from "b" to "a" does not exist' });
  });
});

describe('removeBox', () => {
  const base: DataflowDocument = {
    v: 1,
    boxes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    flows: [{ from: 'a', to: 'b' }],
  };

  it('errors when the box does not exist', () => {
    const result = removeBox(base, 'missing');
    expect(result).toEqual({ ok: false, error: 'box "missing" does not exist' });
  });

  it('errors when flows attach to the box and cascade is not set', () => {
    const result = removeBox(base, 'a');
    expect(result.ok).toBe(false);
  });

  it('removes the box and its flows with cascade', () => {
    const result = removeBox(base, 'a', { cascade: true });
    expect(result).toEqual({ ok: true, doc: { v: 1, boxes: [{ id: 'b', name: 'B' }], flows: [] } });
  });

  it('removes a box with no attached flows without cascade', () => {
    const doc: DataflowDocument = { v: 1, boxes: [{ id: 'a', name: 'A' }], flows: [] };
    const result = removeBox(doc, 'a');
    expect(result).toEqual({ ok: true, doc: { v: 1, boxes: [], flows: [] } });
  });
});

describe('applyDataflowBatch', () => {
  it('applies actions in order', () => {
    const result = applyDataflowBatch(emptyDataflowDocument(), [
      { type: 'addBox', name: 'A' },
      { type: 'addBox', name: 'B' },
      { type: 'connect', from: 'a', to: 'b' },
    ]);
    expect(result).toEqual({
      ok: true,
      doc: {
        v: 1,
        boxes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        flows: [{ from: 'a', to: 'b' }],
      },
    });
  });

  it('is atomic: a failing middle action leaves the document untouched', () => {
    const original = emptyDataflowDocument();
    const result = applyDataflowBatch(original, [
      { type: 'addBox', name: 'A' },
      { type: 'connect', from: 'a', to: 'missing' },
      { type: 'addBox', name: 'C' },
    ]);
    expect(result.ok).toBe(false);
    expect(original).toEqual({ v: 1, boxes: [], flows: [] });
  });
});
