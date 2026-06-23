import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getNode, listNodes, listEdges, neighborhoodOf } from '../src/query-tools.js'

const SERVER = 'http://localhost:4080'
const PATH = 'test.graph.json'

const MOCK_DOCUMENT = {
  version: 3,
  pack: 'test-pack',
  nodes: [
    { id: 'n1', kind: 'prim.box', props: { label: 'Node 1', count: 10 }, tags: ['active'] },
    { id: 'n2', kind: 'prim.box', props: { label: 'Node 2', count: 5 }, tags: ['deprecated'] },
    { id: 'n3', kind: 'prim.circle', props: { label: 'Node 3' }, tags: ['active'] },
  ],
  edges: [
    { id: 'e1', kind: 'prim.arrow', from: 'n1', to: 'n2', props: {}, tags: [] },
    { id: 'e2', kind: 'prim.arrow', from: 'n2', to: 'n3', props: {}, tags: ['important'] },
  ],
}

function mockFetchDoc(doc = MOCK_DOCUMENT) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => doc })
}

describe('getNode', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = mockFetchDoc()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the correct node summary for a known id', async () => {
    const node = await getNode(SERVER, PATH, 'n1')
    expect(node).toEqual({ id: 'n1', kind: 'prim.box', props: { label: 'Node 1', count: 10 }, tags: ['active'] })
  })

  it('throws with a readable message when the node does not exist', async () => {
    await expect(getNode(SERVER, PATH, 'missing')).rejects.toThrow(/not found/i)
  })
})

describe('listNodes', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = mockFetchDoc()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns all nodes when filter is omitted', async () => {
    const { nodes } = await listNodes(SERVER, PATH)
    expect(nodes).toHaveLength(3)
  })

  it('filters by kind', async () => {
    const { nodes } = await listNodes(SERVER, PATH, { kind: 'prim.circle' })
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('n3')
  })

  it('filters by prop predicate', async () => {
    const { nodes } = await listNodes(SERVER, PATH, { props: { count: { op: 'gte', value: 10 } } })
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('n1')
  })

  it('filters by tags (any)', async () => {
    const { nodes } = await listNodes(SERVER, PATH, { tags: { any: ['deprecated'] } })
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('n2')
  })

  it('supports compound and filter', async () => {
    const { nodes } = await listNodes(SERVER, PATH, {
      and: [{ kind: 'prim.box' }, { tags: { any: ['active'] } }],
    })
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('n1')
  })
})

describe('listEdges', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = mockFetchDoc()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns all edges when filter is omitted', async () => {
    const { edges } = await listEdges(SERVER, PATH)
    expect(edges).toHaveLength(2)
  })

  it('filters by kind', async () => {
    const { edges } = await listEdges(SERVER, PATH, { kind: 'prim.arrow' })
    expect(edges).toHaveLength(2)
  })

  it('filters by from node', async () => {
    const { edges } = await listEdges(SERVER, PATH, { from: 'n1' })
    expect(edges).toHaveLength(1)
    expect(edges[0].id).toBe('e1')
  })

  it('filters by tags', async () => {
    const { edges } = await listEdges(SERVER, PATH, { tags: { any: ['important'] } })
    expect(edges).toHaveLength(1)
    expect(edges[0].id).toBe('e2')
  })
})

describe('neighborhoodOf', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = mockFetchDoc()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns center node and immediate neighbors at hops=1', async () => {
    const result = await neighborhoodOf(SERVER, PATH, 'n2', 1)
    const nodeIds = result.nodes.map((n) => n.id).sort()
    const edgeIds = result.edges.map((e) => e.id).sort()
    expect(nodeIds).toEqual(['n1', 'n2', 'n3'])
    expect(edgeIds).toEqual(['e1', 'e2'])
  })

  it('returns only center node when it has no connections', async () => {
    // Use a document with an isolated node
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 3,
        nodes: [
          { id: 'iso', kind: 'prim.box', props: {}, tags: [] },
        ],
        edges: [],
      }),
    }))
    const result = await neighborhoodOf(SERVER, PATH, 'iso', 1)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('iso')
    expect(result.edges).toHaveLength(0)
  })
})

describe('malformed graph error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces a readable error when a dangling edge is detected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 3,
        nodes: [{ id: 'n1', kind: 'prim.box', props: {}, tags: [] }],
        edges: [{ id: 'e1', kind: 'prim.arrow', from: 'n1', to: 'MISSING', props: {}, tags: [] }],
      }),
    }))

    // The error bubbles up from buildGraph with a readable message
    await expect(listNodes(SERVER, PATH)).rejects.toThrow(/MISSING/)
  })
})
