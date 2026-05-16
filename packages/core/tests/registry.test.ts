import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPack,
  getNodeKind,
  getEdgeKind,
  getView,
  listViews,
  getLayer,
  getDisclosureSchema,
  resolvePack,
  getNodeRenderer,
  getEdgeRenderer,
  resetRegistry,
} from '../src/registry.ts';
import type { Pack, NodeRenderer, EdgeRenderer } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const propsSchema = {
  parse: (x: unknown) => x,
  safeParse: (x: unknown) => ({ success: true as const, data: x }),
};

const cardRenderer: NodeRenderer = (_node, _ctx) => null;
const openRenderer: NodeRenderer = (_node, _ctx) => null;
const edgeCardRenderer: EdgeRenderer = (_edge, _ctx) => null;

function makeTestPack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: 'test',
    version: '0.0.1',
    nodeKinds: [
      {
        id: 'test.foo',
        label: 'Foo',
        propsSchema,
        idDerivation: (x) => String(x),
      },
    ],
    edgeKinds: [
      {
        id: 'test.bar',
        label: 'Bar',
        propsSchema,
        directed: true,
      },
    ],
    nodeRenderers: {
      'test.foo': { card: cardRenderer },
    },
    edgeRenderers: {},
    views: [
      {
        id: 'test.view',
        name: 'Test View',
        nodeRoles: {},
        edgeRoles: {},
        layers: {},
        layout: { algorithm: 'manual' },
      },
    ],
    layers: [
      {
        id: 'test.layer',
        name: 'Test Layer',
        edgeKinds: ['test.bar'],
        defaultState: 'on',
      },
    ],
    disclosureSchemas: [
      {
        kind: 'test.foo',
        peek: [],
        card: ['name'],
        open: ['name', 'description'],
        deep: ['name', 'description', 'details'],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  resetRegistry();
});

// ---------------------------------------------------------------------------
// Basic registration
// ---------------------------------------------------------------------------

describe('registerPack', () => {
  it('resolves getNodeKind after registration', () => {
    registerPack(makeTestPack());
    const kind = getNodeKind('test.foo');
    expect(kind).toBeDefined();
    expect(kind?.id).toBe('test.foo');
  });

  it('resolves getEdgeKind after registration', () => {
    registerPack(makeTestPack());
    const kind = getEdgeKind('test.bar');
    expect(kind).toBeDefined();
    expect(kind?.id).toBe('test.bar');
  });

  it('resolves getView after registration', () => {
    registerPack(makeTestPack());
    const view = getView('test.view');
    expect(view).toBeDefined();
    expect(view?.id).toBe('test.view');
  });

  it('listViews returns registered views in insertion order', () => {
    registerPack(makeTestPack());
    const views = listViews();
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('test.view');
  });

  it('resolves getLayer after registration', () => {
    registerPack(makeTestPack());
    const layer = getLayer('test.layer');
    expect(layer).toBeDefined();
    expect(layer?.id).toBe('test.layer');
  });

  it('resolves getDisclosureSchema after registration', () => {
    registerPack(makeTestPack());
    const schema = getDisclosureSchema('test.foo');
    expect(schema).toBeDefined();
    expect(schema?.kind).toBe('test.foo');
  });

  it('resolves resolvePack after registration', () => {
    const pack = makeTestPack();
    registerPack(pack);
    expect(resolvePack('test')).toBe(pack);
  });
});

// ---------------------------------------------------------------------------
// Duplicate registration errors
// ---------------------------------------------------------------------------

describe('duplicate detection', () => {
  it('throws when registering the same pack twice', () => {
    registerPack(makeTestPack());
    expect(() => registerPack(makeTestPack())).toThrow('registerPack: pack "test" already registered');
  });

  it('throws with both pack ids when a second pack declares the same nodeKind id', () => {
    registerPack(makeTestPack());
    const conflicting = makeTestPack({ id: 'other', nodeKinds: [{ id: 'test.foo', label: 'Foo2', propsSchema, idDerivation: (x) => String(x) }] });
    expect(() => registerPack(conflicting)).toThrow(/duplicate node kind "test\.foo".*already registered by pack "test"/);
  });
});

// ---------------------------------------------------------------------------
// Renderer fallback ladder
// ---------------------------------------------------------------------------

describe('getNodeRenderer fallback', () => {
  it('returns the card renderer when requesting card', () => {
    registerPack(makeTestPack());
    expect(getNodeRenderer('test.foo', 'card')).toBe(cardRenderer);
  });

  it('falls back from open to card when only card is registered', () => {
    registerPack(makeTestPack());
    expect(getNodeRenderer('test.foo', 'open')).toBe(cardRenderer);
  });

  it('falls back from deep to card when only card is registered', () => {
    registerPack(makeTestPack());
    expect(getNodeRenderer('test.foo', 'deep')).toBe(cardRenderer);
  });

  it('returns undefined for peek when only card is registered', () => {
    registerPack(makeTestPack());
    expect(getNodeRenderer('test.foo', 'peek')).toBeUndefined();
  });

  it('returns undefined for unknown kind', () => {
    registerPack(makeTestPack());
    expect(getNodeRenderer('test.unknown', 'card')).toBeUndefined();
  });

  it('returns open renderer when both card and open are registered and open is requested', () => {
    const pack = makeTestPack({
      nodeRenderers: { 'test.foo': { card: cardRenderer, open: openRenderer } },
    });
    registerPack(pack);
    expect(getNodeRenderer('test.foo', 'open')).toBe(openRenderer);
  });

  it('returns open renderer when both card and open are registered and deep is requested', () => {
    const pack = makeTestPack({
      nodeRenderers: { 'test.foo': { card: cardRenderer, open: openRenderer } },
    });
    registerPack(pack);
    expect(getNodeRenderer('test.foo', 'deep')).toBe(openRenderer);
  });

  it('returns card renderer when both card and open are registered and card is requested', () => {
    const pack = makeTestPack({
      nodeRenderers: { 'test.foo': { card: cardRenderer, open: openRenderer } },
    });
    registerPack(pack);
    expect(getNodeRenderer('test.foo', 'card')).toBe(cardRenderer);
  });
});

// ---------------------------------------------------------------------------
// Edge renderer fallback
// ---------------------------------------------------------------------------

describe('getEdgeRenderer fallback', () => {
  it('returns undefined for unknown kind', () => {
    registerPack(makeTestPack());
    expect(getEdgeRenderer('test.bar', 'card')).toBeUndefined();
  });

  it('falls back from open to card when only card is registered', () => {
    const pack = makeTestPack({
      edgeRenderers: { 'test.bar': { card: edgeCardRenderer } },
    });
    registerPack(pack);
    expect(getEdgeRenderer('test.bar', 'card')).toBe(edgeCardRenderer);
    expect(getEdgeRenderer('test.bar', 'open')).toBe(edgeCardRenderer);
    expect(getEdgeRenderer('test.bar', 'peek')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resetRegistry
// ---------------------------------------------------------------------------

describe('resetRegistry', () => {
  it('clears all registered data', () => {
    registerPack(makeTestPack());
    resetRegistry();
    expect(getNodeKind('test.foo')).toBeUndefined();
    expect(getEdgeKind('test.bar')).toBeUndefined();
    expect(getView('test.view')).toBeUndefined();
    expect(listViews()).toHaveLength(0);
    expect(getLayer('test.layer')).toBeUndefined();
    expect(getDisclosureSchema('test.foo')).toBeUndefined();
    expect(resolvePack('test')).toBeUndefined();
    expect(getNodeRenderer('test.foo', 'card')).toBeUndefined();
  });

  it('allows re-registration after reset', () => {
    registerPack(makeTestPack());
    resetRegistry();
    expect(() => registerPack(makeTestPack())).not.toThrow();
    expect(getNodeKind('test.foo')).toBeDefined();
  });
});
