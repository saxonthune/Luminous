import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchServerSources } from '../serverSources';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchServerSources', () => {
  it('returns only allowlisted sources', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/documents') {
        return Promise.resolve({
          json: () => Promise.resolve({
            documents: [
              { path: 'rtp-statechart.graph.json', name: 'rtp-statechart', lastModified: 1000 },
              { path: 'old-v2.graph.json', name: 'old-v2', lastModified: 2000 },
              { path: 'subdir/another.graph.json', name: 'another', lastModified: 3000 },
            ],
          }),
        });
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }));

    const sources = await fetchServerSources();
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('rtp-statechart.graph.json');
    expect(sources[0].label).toBe('rtp-statechart');
  });

  it("each source's load() calls the correct document URL", async () => {
    const mockFetch = vi.fn((url: string) => {
      if (url === '/api/documents') {
        return Promise.resolve({
          json: () => Promise.resolve({
            documents: [
              { path: 'rtp-statechart.graph.json', name: 'rtp-statechart', lastModified: 1000 },
            ],
          }),
        });
      }
      if (url === '/api/document/rtp-statechart.graph.json') {
        return Promise.resolve({ text: () => Promise.resolve('{"version":3}') });
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    });
    vi.stubGlobal('fetch', mockFetch);

    const sources = await fetchServerSources();
    const text = await sources[0].load();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/document/' + encodeURIComponent('rtp-statechart.graph.json')
    );
    expect(text).toBe('{"version":3}');
  });
});
