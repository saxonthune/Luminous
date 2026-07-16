import { describe, it, expect } from 'vitest';
import { checkAtlasDocument } from '../../src/atlas/check.ts';
import type { AtlasDocument } from '../../src/atlas/types.ts';

describe('checkAtlasDocument', () => {
  it('returns no issues for a well-formed document', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      edges: [{ from: 'a', to: 'b' }],
    };
    expect(checkAtlasDocument(doc)).toEqual([]);
  });

  it('warns on duplicate node names within the same container', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'Dup' }, { id: 'b', name: 'Dup' }],
      edges: [],
    };
    expect(checkAtlasDocument(doc)).toEqual([
      { severity: 'warning', message: 'duplicate node name "Dup" in the same container' },
    ]);
  });

  it('does not warn when the duplicate names live in different containers', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root1', name: 'Root 1' },
        { id: 'root2', name: 'Root 2' },
        { id: 'a', name: 'Dup', parent: 'root1' },
        { id: 'b', name: 'Dup', parent: 'root2' },
      ],
      edges: [],
    };
    expect(checkAtlasDocument(doc)).toEqual([]);
  });

  it('errors on an edge referencing an unknown node', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }],
      edges: [{ from: 'a', to: 'missing' }],
    };
    expect(checkAtlasDocument(doc)).toEqual([
      { severity: 'error', message: 'edge references unknown node id "missing"' },
    ]);
  });
});
