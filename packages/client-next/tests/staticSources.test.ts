import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchStaticSources } from '../src/sources/staticSources';
import { siblingPackUrl } from '../src/pack/siblingLoader';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Stub import.meta.env.BASE_URL — Vite sets this; in tests it defaults to '/'
// We use the actual value the test environment provides ('/') throughout.

describe('fetchStaticSources', () => {
  it('returns CanvasSource[] with correct id/label/root', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/canvases/index.json') {
        return Promise.resolve({
          json: () => Promise.resolve({
            canvases: [
              { path: 'sample-primitives.graph.json', name: 'Sample Primitives', root: 'demos' },
              { path: 'foo/bar.graph.json', name: 'Bar Canvas', root: 'foo' },
            ],
          }),
        });
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }));

    const sources = await fetchStaticSources();
    expect(sources).toHaveLength(2);
    expect(sources[0].id).toBe('sample-primitives.graph.json');
    expect(sources[0].label).toBe('Sample Primitives');
    expect(sources[0].root).toBe('demos');
    expect(sources[1].id).toBe('foo/bar.graph.json');
    expect(sources[1].label).toBe('Bar Canvas');
    expect(sources[1].root).toBe('foo');
  });

  it("each source's load() fetches from BASE_URL/canvases/<path> and returns text", async () => {
    const mockFetch = vi.fn((url: string) => {
      if (url === '/canvases/index.json') {
        return Promise.resolve({
          json: () => Promise.resolve({
            canvases: [
              { path: 'sample-primitives.graph.json', name: 'Sample Primitives', root: 'demos' },
            ],
          }),
        });
      }
      if (url === '/canvases/sample-primitives.graph.json') {
        return Promise.resolve({ text: () => Promise.resolve('{"version":3}') });
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    });
    vi.stubGlobal('fetch', mockFetch);

    const sources = await fetchStaticSources();
    const text = await sources[0].load();

    expect(mockFetch).toHaveBeenCalledWith('/canvases/sample-primitives.graph.json');
    expect(text).toBe('{"version":3}');
  });
});

describe('siblingPackUrl', () => {
  it('static=true produces a BASE_URL/canvases/... URL', () => {
    const url = siblingPackUrl('sample-primitives.graph.json', 'primitives', true);
    expect(url).toBe('/canvases/primitives.pack.json');
  });

  it('static=true preserves directory prefix from sourceId', () => {
    const url = siblingPackUrl('foo/bar.graph.json', 'my-pack', true);
    expect(url).toBe('/canvases/foo/my-pack.pack.json');
  });

  it('static=false produces an /api/pack/... URL', () => {
    const url = siblingPackUrl('workspace/.canvases/foo.graph.json', 'primitives', false);
    expect(url).toBe('/api/pack/' + encodeURIComponent('workspace/.canvases/primitives.pack.json'));
  });

  it('static=false with top-level sourceId encodes correctly', () => {
    const url = siblingPackUrl('foo.graph.json', 'my-pack', false);
    expect(url).toBe('/api/pack/' + encodeURIComponent('my-pack.pack.json'));
  });
});
