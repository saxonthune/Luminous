import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  loadAtlas,
  writeAtlas,
  listAtlases,
  createAtlas,
  readAtlas,
  nodeCreate,
  nodeSet,
  nodeReparent,
  nodeDelete,
  edgeConnect,
  edgeDisconnect,
  edgeBisect,
  legendSet,
  applyBatch,
  getAtlasNode,
  searchAtlasNodes,
  listAtlasChildren,
  listAtlasEdges,
  atlasNeighborhood,
} from '../src/atlas-tools.js'

const SERVER = 'http://localhost:4080'
const PATH = 'braincrawl.atlas.json'

function emptyDoc() {
  return { v: 1, nodes: [], edges: [] }
}

function docWithTwoNodes() {
  return {
    v: 1,
    nodes: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    edges: [],
  }
}

function mockFetch(handlers: Record<string, () => { ok: boolean; json?: () => Promise<unknown>; status?: number }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (key.startsWith(pattern)) {
        const res = handler()
        return { ok: res.ok, status: res.status ?? (res.ok ? 200 : 500), json: res.json ?? (async () => ({})) } as Response
      }
    }
    throw new Error(`unexpected fetch: ${key}`)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadAtlas', () => {
  it('parses a valid document from the server', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await loadAtlas(SERVER, PATH)
    expect(doc.nodes).toHaveLength(2)
  })

  it('throws a readable error on malformed documents', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => ({ v: 1, nodes: 'oops', edges: [] }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadAtlas(SERVER, PATH)).rejects.toThrow(/nodes/)
  })
})

describe('listAtlases', () => {
  it('filters to paths ending .atlas.json', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/documents`]: () => ({
        ok: true,
        json: async () => ({
          documents: [
            { path: 'braincrawl.atlas.json' },
            { path: 'overview.graph.json' },
            { path: 'other.atlas.json' },
          ],
        }),
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { paths } = await listAtlases(SERVER)
    expect(paths).toEqual(['braincrawl.atlas.json', 'other.atlas.json'])
  })
})

describe('createAtlas', () => {
  it('rejects paths that do not end .atlas.json', async () => {
    await expect(createAtlas(SERVER, 'overview.graph.json')).rejects.toThrow(/atlas\.json/)
  })

  it('writes an empty document for a valid path', async () => {
    const fetchMock = mockFetch({
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await createAtlas(SERVER, PATH)
    expect(doc).toEqual(emptyDoc())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.path).toBe(PATH)
    expect(body.content).toEqual(emptyDoc())
  })
})

describe('readAtlas', () => {
  it('returns the parsed document, with no filled slots when the sidecar 404s', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
      [`GET ${SERVER}/api/atlasdata/`]: () => ({ ok: false, status: 404 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await readAtlas(SERVER, PATH)
    expect(result.document.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(result.filledSlots).toEqual([])
  })

  it('preserves Container Port positions', async () => {
    const doc = {
      v: 1,
      nodes: [
        {
          id: 'container',
          name: 'Container',
          ports: {
            entry: { side: 'top', offset: 0.25 },
            exit: { side: 'bottom', offset: 0.75 },
          },
        },
        { id: 'child', name: 'Child', parent: 'container' },
      ],
      edges: [],
    }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`GET ${SERVER}/api/atlasdata/`]: () => ({ ok: false, status: 404 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await readAtlas(SERVER, PATH)

    expect(result.document.nodes[0]?.ports).toEqual(doc.nodes[0]?.ports)
  })

  it('reports a filled slot as filled and a slot naming an absent key as unfilled', async () => {
    const doc = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A', content: { text: 'fallback', mode: 'markdown', from: 'cli.build' } },
        { id: 'b', name: 'B', content: { text: 'fallback', mode: 'markdown', from: 'cli.missing' } },
        { id: 'c', name: 'C' },
      ],
      edges: [],
    }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`GET ${SERVER}/api/atlasdata/`]: () => ({
        ok: true,
        json: async () => ({ v: 1, entries: { 'cli.build': { text: 'sidecar text' } } }),
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await readAtlas(SERVER, PATH)
    expect(result.filledSlots).toEqual([
      { id: 'a', from: 'cli.build', filled: true },
      { id: 'b', from: 'cli.missing', filled: false },
    ])
  })
})

describe('nodeCreate', () => {
  it('writes the mutated document with the explicit id', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await nodeCreate(SERVER, PATH, { id: 'cli.braincrawl.openalex', name: 'OpenAlex' })
    expect(doc.nodes).toEqual([{ id: 'cli.braincrawl.openalex', name: 'OpenAlex' }])
    const writeCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/document/write'))
    const body = JSON.parse((writeCall![1] as RequestInit).body as string)
    expect(body.content.nodes[0].id).toBe('cli.braincrawl.openalex')
  })

  it('rejects a duplicate id and writes nothing', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(nodeCreate(SERVER, PATH, { id: 'a', name: 'Dup' })).rejects.toThrow(/"a"/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('nodeSet / nodeReparent / nodeDelete', () => {
  it('nodeSet renames a node', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await nodeSet(SERVER, PATH, 'a', { name: 'Alpha' })
    expect(doc.nodes.find((n) => n.id === 'a')!.name).toBe('Alpha')
  })

  it('nodeSet sets content', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await nodeSet(SERVER, PATH, 'a', { content: { text: 'hello', mode: 'markdown' } })
    expect(doc.nodes.find((n) => n.id === 'a')!.content).toEqual({ text: 'hello', mode: 'markdown' })
  })

  it('nodeSet preserves fields omitted by an MCP request', async () => {
    const stored = {
      ...docWithTwoNodes(),
      nodes: [
        { id: 'container', name: 'Container' },
        { id: 'a', name: 'A', parent: 'container', x: 12, y: 34, color: 'accent-2' as const },
      ],
    }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => stored }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const doc = await nodeSet(SERVER, PATH, 'a', {
      name: undefined,
      content: { text: 'hello', mode: 'markdown' },
      x: undefined,
      y: undefined,
      color: undefined,
      contentHeight: undefined,
      contentWidth: undefined,
    })

    expect(doc.nodes.find((n) => n.id === 'a')).toEqual({
      id: 'a',
      name: 'A',
      parent: 'container',
      x: 12,
      y: 34,
      color: 'accent-2',
      content: { text: 'hello', mode: 'markdown' },
    })
  })

  it('nodeReparent moves a node under another', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await nodeReparent(SERVER, PATH, 'a', 'b')
    expect(doc.nodes.find((n) => n.id === 'a')!.parent).toBe('b')
  })

  it('nodeReparent rejects a cycle and writes nothing', async () => {
    const doc = { ...docWithTwoNodes(), nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', parent: 'a' }] }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(nodeReparent(SERVER, PATH, 'a', 'b')).rejects.toThrow(/cycle/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('nodeDelete removes a node and its descendants', async () => {
    const doc = {
      v: 1,
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parent: 'a' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await nodeDelete(SERVER, PATH, 'a')
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })
})

describe('edgeConnect / edgeDisconnect', () => {
  it('edgeConnect adds an edge', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await edgeConnect(SERVER, PATH, 'a', 'b')
    expect(doc.edges).toEqual([{ from: 'a', to: 'b' }])
  })

  it('edgeConnect rejects an unknown endpoint and writes nothing', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(edgeConnect(SERVER, PATH, 'a', 'missing')).rejects.toThrow(/missing/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('edgeDisconnect removes an edge', async () => {
    const doc = { ...docWithTwoNodes(), edges: [{ from: 'a', to: 'b' }] }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await edgeDisconnect(SERVER, PATH, 'a', 'b')
    expect(result.edges).toEqual([])
  })
})

describe('edgeBisect', () => {
  it('turns A -> B into A -> N -> B', async () => {
    const doc = { ...docWithTwoNodes(), edges: [{ from: 'a', to: 'b' }] }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await edgeBisect(SERVER, PATH, { from: 'a', to: 'b' }, { id: 'n', name: 'Middle' })
    expect(result.nodes.map((n) => n.id)).toEqual(['a', 'b', 'n'])
    expect(result.edges).toEqual([
      { from: 'a', to: 'n' },
      { from: 'n', to: 'b' },
    ])
    const writeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/document/write'))
    expect(writeCalls).toHaveLength(1)
  })
})

describe('legendSet', () => {
  it('replaces the whole legend and writes once', async () => {
    const doc = { ...emptyDoc(), legend: { 'accent-1': 'old' } }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await legendSet(SERVER, PATH, { 'accent-2': 'data store' })
    expect(result.legend).toEqual({ 'accent-2': 'data store' })
    const writeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/document/write'))
    expect(writeCalls).toHaveLength(1)
  })

  it('rejects an unrecognized color token and writes nothing', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(legendSet(SERVER, PATH, { red: 'nope' } as never)).rejects.toThrow(/color token/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('applyBatch', () => {
  it('writes once on success', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await applyBatch(SERVER, PATH, [
      { type: 'addNode', id: 'a', name: 'A' },
      { type: 'addNode', id: 'b', name: 'B' },
      { type: 'addEdge', from: 'a', to: 'b' },
    ])
    expect(doc.nodes).toHaveLength(2)
    expect(doc.edges).toEqual([{ from: 'a', to: 'b' }])
    const writeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/document/write'))
    expect(writeCalls).toHaveLength(1)
  })

  it('writes nothing when a later action fails', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      applyBatch(SERVER, PATH, [
        { type: 'addNode', id: 'a', name: 'A' },
        { type: 'addEdge', from: 'a', to: 'missing' },
      ]),
    ).rejects.toThrow(/missing/)
    const writeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/document/write'))
    expect(writeCalls).toHaveLength(0)
  })
})

describe('getAtlasNode', () => {
  it('returns the complete authored node with the exact id', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const node = await getAtlasNode(SERVER, PATH, 'b')
    expect(node).toEqual({ id: 'b', name: 'B' })
  })

  it('throws a readable error naming the missing id and document', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAtlasNode(SERVER, PATH, 'missing')).rejects.toThrow(/missing.*braincrawl\.atlas\.json/s)
  })

  it('never calls the write endpoint', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoNodes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await getAtlasNode(SERVER, PATH, 'a')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('/write')
  })
})

describe('searchAtlasNodes', () => {
  function searchDoc() {
    return {
      v: 1,
      nodes: [
        { id: 'cli.build', name: 'Build Tool', content: { text: 'Compiles sources', mode: 'markdown' as const } },
        { id: 'cli.deploy', name: 'Deployer', content: { text: 'ships BUILD artifacts', mode: 'markdown' as const, from: 'cli.deploy.slot' } },
        { id: 'other', name: 'Unrelated' },
      ],
      edges: [],
    }
  }

  it('matches a case-insensitive literal substring across id, name, content.text, and content.from', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => searchDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { nodes } = await searchAtlasNodes(SERVER, PATH, 'build')
    expect(nodes.map((n) => n.id)).toEqual(['cli.build', 'cli.deploy'])
  })

  it('matches content.from and returns each node once even when several fields match', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => searchDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { nodes } = await searchAtlasNodes(SERVER, PATH, 'deploy')
    expect(nodes.map((n) => n.id)).toEqual(['cli.deploy'])
  })

  it('treats the input as literal text, not a regular expression', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => searchDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { nodes } = await searchAtlasNodes(SERVER, PATH, 'build.*deploy')
    expect(nodes).toEqual([])
  })
})

describe('listAtlasChildren', () => {
  function containmentDoc() {
    return {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root' },
        { id: 'child1', name: 'Child1', parent: 'root' },
        { id: 'child2', name: 'Child2', parent: 'root' },
        { id: 'grandchild', name: 'Grandchild', parent: 'child1' },
      ],
      edges: [],
    }
  }

  it('returns direct children by default', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => containmentDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { nodes } = await listAtlasChildren(SERVER, PATH, 'root')
    expect(nodes.map((n) => n.id)).toEqual(['child1', 'child2'])
  })

  it('adds deeper descendants as depth grows, in document order', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => containmentDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { nodes } = await listAtlasChildren(SERVER, PATH, 'root', 2)
    expect(nodes.map((n) => n.id)).toEqual(['child1', 'child2', 'grandchild'])
  })

  it('depth 0 returns an empty list', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => containmentDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { nodes } = await listAtlasChildren(SERVER, PATH, 'root', 0)
    expect(nodes).toEqual([])
  })

  it('throws when the starting node does not exist', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => containmentDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(listAtlasChildren(SERVER, PATH, 'missing')).rejects.toThrow(/missing/)
  })

  it('rejects a negative or fractional depth', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => containmentDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(listAtlasChildren(SERVER, PATH, 'root', -1)).rejects.toThrow(/depth/)
    await expect(listAtlasChildren(SERVER, PATH, 'root', 1.5)).rejects.toThrow(/depth/)
  })
})

describe('listAtlasEdges', () => {
  function edgeDoc() {
    return {
      v: 1,
      nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
      ],
    }
  }

  it('returns every edge when neither endpoint is supplied', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => edgeDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { edges } = await listAtlasEdges(SERVER, PATH)
    expect(edges).toEqual(edgeDoc().edges)
  })

  it('filters by from, by to, and by both together', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => edgeDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await listAtlasEdges(SERVER, PATH, 'a')).edges).toEqual([{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }])
    expect((await listAtlasEdges(SERVER, PATH, undefined, 'c')).edges).toEqual([{ from: 'b', to: 'c' }, { from: 'a', to: 'c' }])
    expect((await listAtlasEdges(SERVER, PATH, 'a', 'c')).edges).toEqual([{ from: 'a', to: 'c' }])
  })
})

describe('atlasNeighborhood', () => {
  function neighborhoodDoc() {
    return {
      v: 1,
      nodes: [
        { id: 'n1', name: 'N1' },
        { id: 'n2', name: 'N2' },
        { id: 'n3', name: 'N3' },
        { id: 'n4', name: 'N4' },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n1' },
        { from: 'n4', to: 'n1' },
      ],
    }
  }

  it('follows only outbound edges for direction "out"', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => neighborhoodDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await atlasNeighborhood(SERVER, PATH, 'n1', 'out', 1)
    expect(result.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(result.edges).toEqual([{ from: 'n1', to: 'n2' }])
  })

  it('follows only inbound edges for direction "in"', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => neighborhoodDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await atlasNeighborhood(SERVER, PATH, 'n1', 'in', 1)
    expect(result.nodes.map((n) => n.id)).toEqual(['n1', 'n3', 'n4'])
    expect(result.edges).toEqual([{ from: 'n3', to: 'n1' }, { from: 'n4', to: 'n1' }])
  })

  it('follows both directions and defaults to direction "both"', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => neighborhoodDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await atlasNeighborhood(SERVER, PATH, 'n1')
    expect(result.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4'])
    expect(result.edges).toEqual([
      { from: 'n1', to: 'n2' },
      { from: 'n3', to: 'n1' },
      { from: 'n4', to: 'n1' },
    ])
  })

  it('expands multiple hops and includes the cycle edge that closes back on the center', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => neighborhoodDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await atlasNeighborhood(SERVER, PATH, 'n1', 'out', 3)
    expect(result.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
    expect(result.edges).toEqual([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n1' },
    ])
  })

  it('depth 0 returns only the center node and no edges', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => neighborhoodDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await atlasNeighborhood(SERVER, PATH, 'n1', 'both', 0)
    expect(result.nodes.map((n) => n.id)).toEqual(['n1'])
    expect(result.edges).toEqual([])
  })

  it('throws when the center node does not exist', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => neighborhoodDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(atlasNeighborhood(SERVER, PATH, 'missing')).rejects.toThrow(/missing/)
  })

  it('rejects an invalid direction or depth', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => neighborhoodDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(atlasNeighborhood(SERVER, PATH, 'n1', 'sideways' as never)).rejects.toThrow(/direction/)
    await expect(atlasNeighborhood(SERVER, PATH, 'n1', 'both', -1)).rejects.toThrow(/depth/)
  })
})

describe('focused-read query functions never write', () => {
  it('none of the five query functions call the write endpoint', async () => {
    const doc = {
      v: 1,
      nodes: [
        { id: 'root', name: 'Root' },
        { id: 'child', name: 'Child', parent: 'root' },
      ],
      edges: [{ from: 'root', to: 'child' }],
    }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await getAtlasNode(SERVER, PATH, 'root')
    await searchAtlasNodes(SERVER, PATH, 'root')
    await listAtlasChildren(SERVER, PATH, 'root')
    await listAtlasEdges(SERVER, PATH)
    await atlasNeighborhood(SERVER, PATH, 'root')

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('/write')
    }
  })
})

describe('writeAtlas', () => {
  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = mockFetch({
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: false, status: 400 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(writeAtlas(SERVER, PATH, emptyDoc())).rejects.toThrow(/HTTP 400/)
  })
})
