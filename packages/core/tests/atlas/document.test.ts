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
          content: { text: 'a child node', mode: 'markdown' },
        },
      ],
      edges: [{ from: 'root', to: 'child' }],
    };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('tolerates a legacy label field on an edge, ignoring it', () => {
    const result = parseAtlasDocument(
      JSON.stringify({
        v: 1,
        nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        edges: [{ from: 'a', to: 'b', label: 'legacy' }],
      }),
    );
    expect(result).toEqual({
      ok: true,
      doc: { v: 1, nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], edges: [{ from: 'a', to: 'b' }] },
    });
  });

  it('accepts a node with code-mode content', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: '{}', mode: 'code' } }],
      edges: [],
    };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('accepts a node with no content', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
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

  it('rejects content missing mode', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', content: { text: 'x' } }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].content.mode: must be "markdown" or "code"');
  });

  it('rejects an invalid mode value, naming both valid values', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', content: { text: 'x', mode: 'html' } }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].content.mode: must be "markdown" or "code"');
  });

  it('rejects an unknown field inside content', () => {
    const result = parseAtlasDocument(
      JSON.stringify({
        v: 1,
        nodes: [{ id: 'a', name: 'A', content: { text: 'x', mode: 'markdown', bogus: 1 } }],
        edges: [],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].content: unknown field "bogus"');
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

  it('round-trips markdown content through serialize/parse', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'desc', mode: 'markdown' } }],
      edges: [],
    };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('round-trips code content through serialize/parse', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: '{}', mode: 'code' } }],
      edges: [],
    };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('round-trips a "from" key through serialize/parse', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A', content: { text: 'fallback', mode: 'markdown', from: 'route.list' } }],
      edges: [],
    };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects a non-string "from"', () => {
    const result = parseAtlasDocument(
      JSON.stringify({
        v: 1,
        nodes: [{ id: 'a', name: 'A', content: { text: 'x', mode: 'markdown', from: 5 } }],
        edges: [],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].content.from: must be a string');
  });

  it('round-trips a parent and an edge through serialize/parse', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parent: 'a' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects a non-string parent', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', parent: 1 }], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].parent: must be a string');
  });

  it('accepts a node with x and y', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', x: 10, y: 20 }], edges: [] };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('accepts a node with no position', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects x without y', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', x: 10 }], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0]: "x" and "y" must appear together');
  });

  it('rejects y without x', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', y: 10 }], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0]: "x" and "y" must appear together');
  });

  it('rejects a non-number x', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', x: '10', y: 20 }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].x: must be a finite number');
  });

  it('rejects 1e999, which JSON.parse turns into Infinity', () => {
    const result = parseAtlasDocument('{"v":1,"nodes":[{"id":"a","name":"A","x":1e999,"y":0}],"edges":[]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].x: must be a finite number');
  });

  it('round-trips a position through serialize/parse', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', x: 5, y: -5 }], edges: [] };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('accepts a node with a valid color', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', color: 'accent-2' }], edges: [] };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('accepts a node with no color', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects an unrecognized color token', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, nodes: [{ id: 'a', name: 'A', color: 'chartreuse' }], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContain('nodes[0].color: unrecognized color token "chartreuse"');
    }
  });

  it('round-trips a color through serialize/parse', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', color: 'accent-8' }], edges: [] };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('accepts a node with a valid content height', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentHeight: 150 }], edges: [] };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects a non-finite content height', () => {
    const result = parseAtlasDocument('{"v":1,"nodes":[{"id":"a","name":"A","contentHeight":1e999}],"edges":[]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].contentHeight: must be a finite number');
  });

  it('round-trips a content height through serialize/parse', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentHeight: 220 }], edges: [] };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('accepts a node with a valid content width', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentWidth: 300 }], edges: [] };
    const result = parseAtlasDocument(JSON.stringify(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('rejects a non-finite content width', () => {
    const result = parseAtlasDocument('{"v":1,"nodes":[{"id":"a","name":"A","contentWidth":1e999}],"edges":[]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('nodes[0].contentWidth: must be a finite number');
  });

  it('round-trips a content width through serialize/parse', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A', contentWidth: 340 }], edges: [] };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });
});

describe('serializeAtlasDocument', () => {
  it('produces stable field order, 2-space indent, and a trailing newline', () => {
    const doc = emptyAtlasDocument();
    const text = serializeAtlasDocument(doc);
    expect(text).toBe('{\n  "v": 1,\n  "nodes": [],\n  "edges": []\n}\n');
  });

  it('omits x and y for an unplaced node rather than emitting null', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const text = serializeAtlasDocument(doc);
    expect(text).not.toContain('"x"');
    expect(text).not.toContain('"y"');
  });

  it('omits color for a node with no color', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const text = serializeAtlasDocument(doc);
    expect(text).not.toContain('"color"');
  });

  it('omits content height for a node with no content height', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const text = serializeAtlasDocument(doc);
    expect(text).not.toContain('"contentHeight"');
  });

  it('omits content width for a node with no content width', () => {
    const doc: AtlasDocument = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] };
    const text = serializeAtlasDocument(doc);
    expect(text).not.toContain('"contentWidth"');
  });

  it('omits label from a serialized edge', () => {
    const doc: AtlasDocument = {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      edges: [{ from: 'a', to: 'b' }],
    };
    const text = serializeAtlasDocument(doc);
    expect(text).not.toContain('"label"');
  });
});

describe('legend', () => {
  it('round-trips a legend through serialize/parse', () => {
    const doc: AtlasDocument = {
      v: 1,
      legend: { 'accent-1': 'user-facing interface', 'accent-4': 'data store' },
      nodes: [],
      edges: [],
    };
    const result = parseAtlasDocument(serializeAtlasDocument(doc));
    expect(result).toEqual({ ok: true, doc });
  });

  it('accepts a document with no legend', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, nodes: [], edges: [] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.legend).toBeUndefined();
  });

  it('parses an empty legend as absent', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, legend: {}, nodes: [], edges: [] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.legend).toBeUndefined();
  });

  it('omits an empty legend from serialization', () => {
    const doc: AtlasDocument = { v: 1, legend: {}, nodes: [], edges: [] };
    expect(serializeAtlasDocument(doc)).not.toContain('"legend"');
  });

  it('rejects a legend that is not an object', () => {
    const result = parseAtlasDocument(JSON.stringify({ v: 1, legend: [], nodes: [], edges: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('legend: must be an object mapping color tokens to labels');
  });

  it('rejects a legend keyed by an unrecognized color token', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, legend: { red: 'user-facing interface' }, nodes: [], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('legend: unrecognized color token "red"');
  });

  it('rejects a legend with a non-string label', () => {
    const result = parseAtlasDocument(
      JSON.stringify({ v: 1, legend: { 'accent-1': 3 }, nodes: [], edges: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('legend.accent-1: label must be a string');
  });
});
