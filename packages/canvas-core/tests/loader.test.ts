import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadCanvasFileFromText, loadCanvasFile } from '../src/loader.ts';
import { registerPack, resetRegistry } from '../src/registry.ts';
import type { Pack } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Stub schema: accepts objects, rejects non-objects
// ---------------------------------------------------------------------------

const fooSchema = {
  parse: (x: unknown) => x,
  safeParse: (x: unknown) =>
    typeof x === 'object' && x !== null
      ? { success: true as const, data: x }
      : { success: false as const, error: 'expected object' },
};

// ---------------------------------------------------------------------------
// Minimal test pack
// ---------------------------------------------------------------------------

function makeTestPack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: 'test',
    version: '0.0.1',
    nodeKinds: [
      {
        id: 'test.foo',
        label: 'Foo',
        propsSchema: fooSchema,
        idDerivation: (x) => String(x),
      },
    ],
    edgeKinds: [
      {
        id: 'test.bar',
        label: 'Bar',
        propsSchema: fooSchema,
        directed: true,
      },
    ],
    nodeRenderers: {},
    edgeRenderers: {},
    views: [],
    layers: [],
    disclosureSchemas: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixtureJson(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
}

function makeCanvasJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 3,
    packs: { test: '^0.0.1' },
    nodes: [
      { id: 'n1', kind: 'test.foo', props: { name: 'A' }, tags: [] },
      { id: 'n2', kind: 'test.foo', props: { name: 'B' }, tags: [] },
    ],
    edges: [
      { id: 'e1', kind: 'test.bar', from: 'n1', to: 'n2', props: {}, tags: [] },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  resetRegistry();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('loadCanvasFileFromText — happy path', () => {
  it('returns a Graph with correct node and edge counts from inline JSON', () => {
    registerPack(makeTestPack());
    const graph = loadCanvasFileFromText(makeCanvasJson());
    expect(graph.nodes.size).toBe(2);
    expect(graph.edges.size).toBe(1);
  });

  it('returns a Graph from the minimal.canvas.json fixture', () => {
    registerPack(makeTestPack());
    const json = fixtureJson('minimal.canvas.json');
    const graph = loadCanvasFileFromText(json);
    expect(graph.nodes.size).toBe(2);
    expect(graph.edges.size).toBe(1);
    expect(graph.nodes.has('node-1')).toBe(true);
    expect(graph.nodes.has('node-2')).toBe(true);
    expect(graph.edges.has('edge-1')).toBe(true);
  });

  it('builds adjacency indices correctly', () => {
    registerPack(makeTestPack());
    const graph = loadCanvasFileFromText(makeCanvasJson());
    expect(graph.outgoing.get('n1')?.has('e1')).toBe(true);
    expect(graph.incoming.get('n2')?.has('e1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Version validation
// ---------------------------------------------------------------------------

describe('loadCanvasFileFromText — version validation', () => {
  it('throws on version 2', () => {
    registerPack(makeTestPack());
    expect(() => loadCanvasFileFromText(makeCanvasJson({ version: 2 }))).toThrow(
      'unsupported version 2'
    );
  });

  it('throws when version field is missing', () => {
    registerPack(makeTestPack());
    const json = JSON.stringify({ packs: {}, nodes: [], edges: [] });
    expect(() => loadCanvasFileFromText(json)).toThrow(/missing.*version/i);
  });

  it('throws on non-numeric version', () => {
    registerPack(makeTestPack());
    expect(() => loadCanvasFileFromText(makeCanvasJson({ version: 'v3' }))).toThrow(
      'unsupported version'
    );
  });
});

// ---------------------------------------------------------------------------
// Invalid JSON
// ---------------------------------------------------------------------------

describe('loadCanvasFileFromText — invalid JSON', () => {
  it('throws with "invalid JSON" message', () => {
    expect(() => loadCanvasFileFromText('{bad json')).toThrow('loadCanvasFile: invalid JSON');
  });

  it('throws on non-object top-level (array)', () => {
    registerPack(makeTestPack());
    expect(() => loadCanvasFileFromText('[]')).toThrow(/expected.*object/i);
  });
});

// ---------------------------------------------------------------------------
// Pack registration check
// ---------------------------------------------------------------------------

describe('loadCanvasFileFromText — pack registration', () => {
  it('throws when a referenced pack is not registered', () => {
    const err = () => loadCanvasFileFromText(makeCanvasJson());
    expect(err).toThrow(/pack "test".*registered/);
  });

  it('includes the pack id and the word "registered" in the error', () => {
    try {
      loadCanvasFileFromText(makeCanvasJson({ packs: { 'unknown-pack': '^1.0.0' } }));
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('unknown-pack');
      expect(msg).toContain('registered');
    }
  });
});

// ---------------------------------------------------------------------------
// Kind validation
// ---------------------------------------------------------------------------

describe('loadCanvasFileFromText — kind validation', () => {
  it('throws when a node references an unknown kind', () => {
    registerPack(makeTestPack());
    const json = makeCanvasJson({
      nodes: [{ id: 'n1', kind: 'test.unknown', props: {}, tags: [] }],
      edges: [],
    });
    expect(() => loadCanvasFileFromText(json)).toThrow(/unknown kind.*test\.unknown/);
  });

  it('throws when an edge references an unknown kind', () => {
    registerPack(makeTestPack());
    const json = makeCanvasJson({
      nodes: [
        { id: 'n1', kind: 'test.foo', props: {}, tags: [] },
        { id: 'n2', kind: 'test.foo', props: {}, tags: [] },
      ],
      edges: [{ id: 'e1', kind: 'test.unknown-edge', from: 'n1', to: 'n2', props: {}, tags: [] }],
    });
    expect(() => loadCanvasFileFromText(json)).toThrow(/edge "e1".*unknown kind/);
  });

  it('throws when a node has malformed props (schema rejects non-object)', () => {
    registerPack(makeTestPack());
    const json = makeCanvasJson({
      nodes: [
        { id: 'bad-node', kind: 'test.foo', props: 'not-an-object', tags: [] },
        { id: 'n2', kind: 'test.foo', props: {}, tags: [] },
      ],
      edges: [],
    });
    expect(() => loadCanvasFileFromText(json)).toThrow(/bad-node/);
  });

  it('aggregates multiple bad nodes into a single error', () => {
    registerPack(makeTestPack());
    const json = makeCanvasJson({
      nodes: [
        { id: 'bad-1', kind: 'test.foo', props: 'bad', tags: [] },
        { id: 'bad-2', kind: 'test.foo', props: 42, tags: [] },
        { id: 'good', kind: 'test.foo', props: {}, tags: [] },
      ],
      edges: [],
    });
    try {
      loadCanvasFileFromText(json);
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('bad-1');
      expect(msg).toContain('bad-2');
    }
  });

  it('aggregates bad nodes AND bad edges in a single throw', () => {
    registerPack(makeTestPack());
    const json = makeCanvasJson({
      nodes: [
        { id: 'bad-node', kind: 'test.foo', props: 'bad', tags: [] },
        { id: 'n2', kind: 'test.foo', props: {}, tags: [] },
      ],
      edges: [
        { id: 'bad-edge', kind: 'test.bar', from: 'bad-node', to: 'n2', props: 'bad', tags: [] },
      ],
    });
    try {
      loadCanvasFileFromText(json);
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('bad-node');
      expect(msg).toContain('bad-edge');
    }
  });
});

// ---------------------------------------------------------------------------
// buildGraph propagation
// ---------------------------------------------------------------------------

describe('loadCanvasFileFromText — buildGraph error propagation', () => {
  it('propagates duplicate node id error from buildGraph', () => {
    registerPack(makeTestPack());
    const json = makeCanvasJson({
      nodes: [
        { id: 'dup', kind: 'test.foo', props: {}, tags: [] },
        { id: 'dup', kind: 'test.foo', props: {}, tags: [] },
      ],
      edges: [],
    });
    expect(() => loadCanvasFileFromText(json)).toThrow(/dup/);
  });
});

// ---------------------------------------------------------------------------
// loadCanvasFile (URL-based)
// ---------------------------------------------------------------------------

describe('loadCanvasFile — URL fetch', () => {
  it('rejects with error containing the URL on HTTP 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404, statusText: 'Not Found' }) as unknown as Response
    );
    await expect(loadCanvasFile('http://example.invalid/nope.json')).rejects.toThrow(
      'http://example.invalid/nope.json'
    );
  });

  it('includes the HTTP status in the error on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 500, statusText: 'Internal Server Error' }) as unknown as Response
    );
    await expect(loadCanvasFile('http://example.invalid/nope.json')).rejects.toThrow('HTTP 500');
  });

  it('resolves a Graph when fetch returns valid JSON', async () => {
    registerPack(makeTestPack());
    const body = makeCanvasJson();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }) as unknown as Response);
    const graph = await loadCanvasFile('http://example.invalid/good.json');
    expect(graph.nodes.size).toBe(2);
    expect(graph.edges.size).toBe(1);
  });

  it('wraps parse errors with the URL prefix', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json', { status: 200 }) as unknown as Response
    );
    await expect(loadCanvasFile('http://example.invalid/bad.json')).rejects.toThrow(
      /loadCanvasFile \[http:\/\/example\.invalid\/bad\.json\]/
    );
  });
});
