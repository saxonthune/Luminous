import { describe, it, expect } from 'vitest';
import { emptyDataflowDocument, parseDataflowDocument, serializeDataflowDocument } from '../../src/dataflow/document.ts';
import type { DataflowDocument } from '../../src/dataflow/types.ts';

describe('emptyDataflowDocument', () => {
  it('returns v1 with no boxes or flows', () => {
    expect(emptyDataflowDocument()).toEqual({ v: 1, boxes: [], flows: [] });
  });
});

describe('parseDataflowDocument', () => {
  it('accepts a valid document', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [
        { id: 'source', name: 'Source' },
        { id: 'sink', name: 'Sink', description: 'receives data', contract: { format: 'json', text: '{}' } },
      ],
      flows: [{ from: 'source', to: 'sink' }],
    };
    const result = parseDataflowDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects invalid JSON', () => {
    const result = parseDataflowDocument('{not json');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object document', () => {
    const result = parseDataflowDocument('[]');
    expect(result.ok).toBe(false);
  });

  it('rejects a document missing v', () => {
    const result = parseDataflowDocument(JSON.stringify({ boxes: [], flows: [] }));
    expect(result).toEqual({ ok: false, issues: ['v: must be a number'] });
  });

  it('rejects a document with an unknown top-level field', () => {
    const result = parseDataflowDocument(JSON.stringify({ v: 1, boxes: [], flows: [], extra: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain(': unknown field "extra"');
  });

  it('rejects boxes that are not an array', () => {
    const result = parseDataflowDocument(JSON.stringify({ v: 1, boxes: {}, flows: [] }));
    expect(result).toEqual({ ok: false, issues: ['boxes: must be an array'] });
  });

  it('rejects a box missing required fields', () => {
    const result = parseDataflowDocument(JSON.stringify({ v: 1, boxes: [{}], flows: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('boxes[0].id: must be a string');
      expect(result.issues).toContain('boxes[0].name: must be a string');
    }
  });

  it('rejects a box with an unknown field', () => {
    const result = parseDataflowDocument(JSON.stringify({ v: 1, boxes: [{ id: 'a', name: 'A', bogus: 1 }], flows: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('boxes[0]: unknown field "bogus"');
  });

  it('rejects a malformed contract', () => {
    const result = parseDataflowDocument(JSON.stringify({ v: 1, boxes: [{ id: 'a', name: 'A', contract: { format: 'json' } }], flows: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('boxes[0].contract.text: must be a string');
  });

  it('rejects duplicate box ids', () => {
    const result = parseDataflowDocument(
      JSON.stringify({ v: 1, boxes: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }], flows: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('boxes[1].id: duplicate box id "a"');
  });

  it('rejects flows that are not an array', () => {
    const result = parseDataflowDocument(JSON.stringify({ v: 1, boxes: [], flows: {} }));
    expect(result).toEqual({ ok: false, issues: ['flows: must be an array'] });
  });

  it('rejects a flow missing required fields', () => {
    const result = parseDataflowDocument(JSON.stringify({ v: 1, boxes: [], flows: [{}] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('flows[0].from: must be a string');
      expect(result.issues).toContain('flows[0].to: must be a string');
    }
  });

  it('rejects a flow referencing a missing box id', () => {
    const result = parseDataflowDocument(
      JSON.stringify({ v: 1, boxes: [{ id: 'a', name: 'A' }], flows: [{ from: 'a', to: 'missing' }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('flows[0].to: references unknown box id "missing"');
  });

  it('round-trips through serialize/parse', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'a', name: 'A', description: 'desc', contract: { format: 'json', text: '{}' } }],
      flows: [],
    };
    const result = parseDataflowDocument(serializeDataflowDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });
});

describe('serializeDataflowDocument', () => {
  it('produces stable field order, 2-space indent, and a trailing newline', () => {
    const doc = emptyDataflowDocument();
    const text = serializeDataflowDocument(doc);
    expect(text).toBe('{\n  "v": 1,\n  "boxes": [],\n  "flows": []\n}\n');
  });
});
