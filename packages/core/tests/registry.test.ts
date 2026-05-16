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
  resetRegistry,
} from '../src/registry.ts';
import type { Pack } from '../src/types.ts';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const propsSchema = {
  parse: (x: unknown) => x,
  safeParse: (x: unknown) => ({ success: true as const, data: x }),
};

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
  });

  it('allows re-registration after reset', () => {
    registerPack(makeTestPack());
    resetRegistry();
    expect(() => registerPack(makeTestPack())).not.toThrow();
    expect(getNodeKind('test.foo')).toBeDefined();
  });
});
