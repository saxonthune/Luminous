import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchServerSources } from '../serverSources';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchServerSources', () => {
  it('returns every document the server lists', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/documents') {
        return Promise.resolve({
          json: () => Promise.resolve({
            documents: [
              { path: 'Luminous/rtp-statechart.graph.json', name: 'rtp-statechart', root: 'Luminous', lastModified: 1000 },
              { path: 'RankThePlanet/poc.graph.json', name: 'poc', root: 'RankThePlanet', lastModified: 2000 },
            ],
          }),
        });
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }));

    const sources = await fetchServerSources();
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.id)).toEqual([
      'Luminous/rtp-statechart.graph.json',
      'RankThePlanet/poc.graph.json',
    ]);
    expect(sources.map((s) => s.root)).toEqual(['Luminous', 'RankThePlanet']);
  });

  it('derives root from the path when the server omits it', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/documents') {
        return Promise.resolve({
          json: () => Promise.resolve({
            documents: [
              { path: 'legacy.graph.json', name: 'legacy', lastModified: 1000 },
            ],
          }),
        });
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }));

    const sources = await fetchServerSources();
    expect(sources[0].root).toBe('workspace');
  });

  it("each source's load() calls the correct document URL", async () => {
    const mockFetch = vi.fn((url: string) => {
      if (url === '/api/documents') {
        return Promise.resolve({
          json: () => Promise.resolve({
            documents: [
              { path: 'Luminous/rtp-statechart.graph.json', name: 'rtp-statechart', root: 'Luminous', lastModified: 1000 },
            ],
          }),
        });
      }
      if (url === '/api/document/' + encodeURIComponent('Luminous/rtp-statechart.graph.json')) {
        return Promise.resolve({ text: () => Promise.resolve('{"version":3}') });
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    });
    vi.stubGlobal('fetch', mockFetch);

    const sources = await fetchServerSources();
    const text = await sources[0].load();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/document/' + encodeURIComponent('Luminous/rtp-statechart.graph.json')
    );
    expect(text).toBe('{"version":3}');
  });
});
