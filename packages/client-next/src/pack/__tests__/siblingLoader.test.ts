import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetRegistry, resolvePack } from '@luminous/core';
import { siblingPackUrl, peekPackName, loadAndRegisterSiblingPack } from '../siblingLoader';

beforeEach(() => {
  resetRegistry();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// siblingPackUrl
// ---------------------------------------------------------------------------

describe('siblingPackUrl', () => {
  it('derives the sibling URL from a namespaced source id', () => {
    const url = siblingPackUrl('workspace/.canvases/foo.graph.json', 'primitives');
    expect(url).toBe('/api/pack/' + encodeURIComponent('workspace/.canvases/primitives.pack.json'));
  });

  it('handles a root-level source id with no directory', () => {
    const url = siblingPackUrl('foo.graph.json', 'my-pack');
    expect(url).toBe('/api/pack/' + encodeURIComponent('my-pack.pack.json'));
  });
});

// ---------------------------------------------------------------------------
// peekPackName
// ---------------------------------------------------------------------------

describe('peekPackName', () => {
  it('returns the pack name from valid graph JSON', () => {
    const text = JSON.stringify({ version: 3, pack: 'primitives', nodes: [], edges: [] });
    expect(peekPackName(text)).toBe('primitives');
  });

  it('returns empty string when pack field is absent', () => {
    const text = JSON.stringify({ version: 3, nodes: [], edges: [] });
    expect(peekPackName(text)).toBe('');
  });

  it('returns empty string on invalid JSON (never throws)', () => {
    expect(peekPackName('{bad json')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// loadAndRegisterSiblingPack
// ---------------------------------------------------------------------------

const minimalPackJson = JSON.stringify({
  id: 'test-pack',
  version: '1.0.0',
  nodeKinds: [
    {
      id: 'test.node',
      label: 'Node',
      props: { type: 'object', properties: { name: { type: 'string' } } },
    },
  ],
  edgeKinds: [],
  views: [],
  layers: [],
  disclosure: [],
});

const graphTextWithPack = JSON.stringify({
  version: 3,
  pack: 'test-pack',
  nodes: [],
  edges: [],
});

describe('loadAndRegisterSiblingPack — successful sibling load', () => {
  it('fetches the sibling pack and registers it', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string) =>
      Promise.resolve(new Response(minimalPackJson, { status: 200 }))
    ));

    await loadAndRegisterSiblingPack('workspace/graphs/foo.graph.json', graphTextWithPack);
    expect(resolvePack('test-pack')).toBeDefined();
  });

  it('does not re-fetch if the pack is already registered', async () => {
    const mockFetch = vi.fn((_url: string) =>
      Promise.resolve(new Response(minimalPackJson, { status: 200 }))
    );
    vi.stubGlobal('fetch', mockFetch);

    await loadAndRegisterSiblingPack('workspace/graphs/foo.graph.json', graphTextWithPack);
    await loadAndRegisterSiblingPack('workspace/graphs/foo.graph.json', graphTextWithPack);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('loadAndRegisterSiblingPack — 404 → fallback, no throw', () => {
  it('does not throw and leaves pack unregistered on 404 for an unknown pack', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string) =>
      Promise.resolve(new Response(null, { status: 404 }))
    ));

    await expect(
      loadAndRegisterSiblingPack('workspace/graphs/foo.graph.json', graphTextWithPack)
    ).resolves.toBeUndefined();

    expect(resolvePack('test-pack')).toBeUndefined();
  });

  it('uses the shipped primitives builtin when sibling 404s for "primitives"', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string) =>
      Promise.resolve(new Response(null, { status: 404 }))
    ));

    const graphWithPrimitives = JSON.stringify({ version: 3, pack: 'primitives', nodes: [], edges: [] });
    await loadAndRegisterSiblingPack('workspace/graphs/foo.graph.json', graphWithPrimitives);

    expect(resolvePack('primitives')).toBeDefined();
  });
});

describe('loadAndRegisterSiblingPack — malformed pack → fallback, no throw', () => {
  it('does not throw when the pack JSON is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string) =>
      Promise.resolve(new Response('{ not valid json {{', { status: 200 }))
    ));

    await expect(
      loadAndRegisterSiblingPack('workspace/graphs/foo.graph.json', graphTextWithPack)
    ).resolves.toBeUndefined();

    expect(resolvePack('test-pack')).toBeUndefined();
  });
});

describe('loadAndRegisterSiblingPack — empty pack name', () => {
  it('does nothing when the graph has no pack field', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const graphWithNoPack = JSON.stringify({ version: 3, nodes: [], edges: [] });
    await loadAndRegisterSiblingPack('workspace/graphs/foo.graph.json', graphWithNoPack);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
