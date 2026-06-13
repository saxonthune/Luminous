import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { describePack, describePackForCanvas } from '../src/pack-describe.js'

const MOCK_PACK = {
  id: 'test-pack',
  version: '0.1.0',
  nodeKinds: [
    {
      id: 'test.node',
      label: 'Test Node',
      props: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
  ],
  edgeKinds: [
    {
      id: 'test.link',
      label: 'Test Link',
      props: { type: 'object' },
      directed: true,
    },
  ],
}

describe('describePack', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns kind catalog for a pack by name', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_PACK })

    const result = await describePack('http://localhost:4080', 'test-pack')

    expect(result.pack).toBe('test-pack')
    expect(result.version).toBe('0.1.0')
    expect(result.nodeKinds).toHaveLength(1)
    expect(result.nodeKinds[0].id).toBe('test.node')
    expect(result.nodeKinds[0].label).toBe('Test Node')
    expect(result.nodeKinds[0].props).toMatchObject({ type: 'object' })
    expect(result.edgeKinds).toHaveLength(1)
    expect(result.edgeKinds[0].id).toBe('test.link')
    expect(result.edgeKinds[0].directed).toBe(true)
  })

  it('appends .pack.json suffix when not present', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_PACK })

    await describePack('http://localhost:4080', 'test-pack')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('test-pack.pack.json'),
    )
  })

  it('does not double-append .pack.json when already present', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => MOCK_PACK })

    await describePack('http://localhost:4080', 'test-pack.pack.json')

    const url = mockFetch.mock.calls[0][0] as string
    expect(url.split('test-pack.pack.json').length - 1).toBe(1)
  })

  it('throws when pack is not found (404)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(describePack('http://localhost:4080', 'missing')).rejects.toThrow(
      /not found/i,
    )
  })

  it('uses pack id from json as pack field, not the filename', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...MOCK_PACK, id: 'canonical-id' }),
    })

    const result = await describePack('http://localhost:4080', 'any-name')
    expect(result.pack).toBe('canonical-id')
  })
})

describe('describePackForCanvas', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves pack from canvas then returns kind catalog', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pack: 'test-pack', nodes: [], edges: [] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_PACK })

    const result = await describePackForCanvas('http://localhost:4080', 'overview.graph.json')

    expect(result.pack).toBe('test-pack')
    expect(result.nodeKinds).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws when canvas read fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(
      describePackForCanvas('http://localhost:4080', 'missing.graph.json'),
    ).rejects.toThrow(/failed to read canvas/i)
  })

  it('throws when canvas has no pack declared', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nodes: [], edges: [] }),
    })

    await expect(
      describePackForCanvas('http://localhost:4080', 'no-pack.graph.json'),
    ).rejects.toThrow(/no pack declared/i)
  })
})
