import { describe, it, expect } from 'vitest';
import { checkAtlasDocument } from '../../src/atlas/check.ts';
import type { AtlasData } from '../../src/atlas/data.ts';
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

  it('does not check the data file when omitted', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'x', mode: 'markdown', from: 'missing.key' } }],
      edges: [],
    };
    expect(checkAtlasDocument(doc)).toEqual([]);
  });

  it('warns on a node content key the data file does not provide', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'x', mode: 'markdown', from: 'missing.key' } }],
      edges: [],
    };
    const data: AtlasData = { v: 1, entries: {} };
    expect(checkAtlasDocument(doc, data)).toEqual([
      { severity: 'warning', message: 'node "a" content names key "missing.key", which the data file does not provide' },
    ]);
  });

  it('warns on a data file entry no node names', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const data: AtlasData = { v: 1, entries: { 'orphan.key': { text: 'unused' } } };
    expect(checkAtlasDocument(doc, data)).toEqual([
      { severity: 'warning', message: 'data file entry "orphan.key" is not named by any node\'s content' },
    ]);
  });

  it('does not warn when every key is provided and used', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'x', mode: 'markdown', from: 'route.list' } }],
      edges: [],
    };
    const data: AtlasData = { v: 1, entries: { 'route.list': { text: 'GET /a' } } };
    expect(checkAtlasDocument(doc, data)).toEqual([]);
  });
});
