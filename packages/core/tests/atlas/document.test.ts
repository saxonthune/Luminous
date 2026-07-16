import { describe, it, expect } from 'vitest';
import { emptyAtlasDocument, parseAtlasDocument, serializeAtlasDocument } from '../../src/atlas/document.ts';
import type { AtlasDocument } from '../../src/atlas/types.ts';

describe('emptyAtlasDocument', () => {
  it('returns v1 with no nodes or edges', () => {
    expect(emptyAtlasDocument()).toEqual({ v: 1, nodes: [], edges: [] });
  });
});

describe('parseAtlasDocument', () => {
  it('accepts a valid document', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root' },
        {
          id: 'child',
          name: 'Child',
          parent: 'root',
          description: 'a child node',
          contract: { format: 'json', text: '{}' },
        },
      ],
      edges: [{ from: 'root', to: 'child', label: 'contains' }],
    };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects invalid JSON', () => {
    const result = parseAtlasDocument('{not json');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object document', () => {
    const result = parseAtlasDocument('[]');
    expect(result.ok).toBe(false);
  });

  it('rejects a document missing v', () => {
    const result = parseAtlasDocument(JSON.stringify({ nodes: [], edges: [] }));
    expect(result).toEqual({ ok: false, issues: ['v: must be a number'] });
  });

  it('rejects a document with an unknown top-level field', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [], edges: [], extra: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain(': unknown field "extra"');
  });

  it('rejects nodes that are not an array', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: {}, edges: [] }));
    expect(result).toEqual({ ok: false, issues: ['nodes: must be an array'] });
  });

  it('rejects a node missing required fields', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [{}], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('nodes[0].id: must be a string');
      expect(result.issues).toContain('nodes[0].name: must be a string');
    }
  });

  it('rejects a node with an unknown field', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', bogus: 1 }], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0]: unknown field "bogus"');
  });

  it('rejects a malformed contract', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', contract: { format: 'json' } }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].contract.text: must be a string');
  });

  it('rejects duplicate node ids', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A' }, { id: 'a', name: 'A2' }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[1].id: duplicate node id "a"');
  });

  it('rejects a parent referencing an unknown node id', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', parent: 'missing' }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].parent: references unknown node id "missing"');
  });

  it('rejects a self-referencing parent cycle', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', parent: 'a' }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('parent cycle: a -> a');
  });

  it('rejects a multi-node parent cycle', () => {
    const result = parseAtlasDocument(
      JSON.stringify({
        v: 1,
        nodes: [
          { id: 'a', name: 'A', parent: 'b' },
          { id: 'b', name: 'B', parent: 'c' },
          { id: 'c', name: 'C', parent: 'a' },
        ],
        edges: [],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.filter((i) => i.startsWith('parent cycle:'))).toHaveLength(1);
      expect(result.issues).toContain('parent cycle: a -> b -> c -> a');
    }
  });

  it('rejects edges that are not an array', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [], edges: {} }));
    expect(result).toEqual({ ok: false, issues: ['edges: must be an array'] });
  });

  it('rejects an edge missing required fields', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [], edges: [{}] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('edges[0].from: must be a string');
      expect(result.issues).toContain('edges[0].to: must be a string');
    }
  });

  it('rejects an edge referencing a missing node id', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [{ from: 'a', to: 'missing' }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('edges[0].to: references unknown node id "missing"');
  });

  it('accumulates multiple issues rather than failing on the first', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{}], edges: [{}] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('nodes[0].id: must be a string');
      expect(result.issues).toContain('edges[0].from: must be a string');
    }
  });

  it('round-trips through serialize/parse', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', description: 'desc', contract: { format: 'json', text: '{}' } }],
      edges: [],
    };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('round-trips a parent and an edge through serialize/parse', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parent: 'a' },
      ],
      edges: [{ from: 'a', to: 'b', label: 'contains' }],
    };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects a non-string parent', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', parent: 1 }], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].parent: must be a string');
  });
});

describe('serializeAtlasDocument', () => {
  it('produces stable field order, 2-space indent, and a trailing newline', () => {
    const doc = emptyAtlasDocument();
    const text = serializeAtlasDocument(doc);
    expect(text).toBe('{\n  "v": 1,\n  "nodes": [],\n  "edges": []\n}\n');
  });
});
