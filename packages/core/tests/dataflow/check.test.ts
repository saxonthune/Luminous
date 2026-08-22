import { describe, it, expect } from 'vitest';
import { checkDocument } from '../../src/dataflow/check.ts';
import type { DataflowDocument } from '../../src/dataflow/types.ts';

describe('checkDocument', () => {
  it('reports no issues for a clean document', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      flows: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }],
    };
    expect(checkDocument(doc)).toEqual([]);
  });

  it('errors on duplicate box ids', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }],
      flows: [],
    };
    const issues = checkDocument(doc);
    expect(issues).toContainEqual({ severity: 'error', message: 'duplicate box id "a"', boxId: 'a' });
  });

  it('errors on duplicate box names', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'a', name: 'Same' }, { id: 'b', name: 'Same' }],
      flows: [],
    };
    const issues = checkDocument(doc);
    expect(issues).toContainEqual({ severity: 'error', message: 'duplicate box name "Same"', boxId: 'a' });
    expect(issues).toContainEqual({ severity: 'error', message: 'duplicate box name "Same"', boxId: 'b' });
  });

  it('errors when a flow endpoint names no box', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'a', name: 'A' }],
      flows: [{ from: 'a', to: 'missing' }],
    };
    const issues = checkDocument(doc);
    expect(issues).toContainEqual({ severity: 'error', message: 'flow references unknown box id "missing"' });
  });

  it('warns on a black-hole box (inbound but no outbound flow)', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      flows: [{ from: 'a', to: 'b' }],
    };
    const issues = checkDocument(doc);
    expect(issues).toContainEqual({ severity: 'warning', message: 'box "B" has inbound flows but no outbound flow', boxId: 'b' });
  });

  it('warns on an orphan box with no flows at all', () => {
    const doc: DataflowDocument = {
      v: 1,
      boxes: [{ id: 'a', name: 'A' }],
      flows: [],
    };
    const issues = checkDocument(doc);
    expect(issues).toContainEqual({ severity: 'warning', message: 'box "A" has no flows', boxId: 'a' });
  });

  it('never blocks on warnings alone', () => {
    const doc: DataflowDocument = { v: 1, boxes: [{ id: 'a', name: 'A' }], flows: [] };
    const issues = checkDocument(doc);
    expect(issues.every(i => i.severity === 'warning')).toBe(true);
  });
});
