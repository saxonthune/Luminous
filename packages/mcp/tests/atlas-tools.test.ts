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

describe('writeAtlas', () => {
  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = mockFetch({
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: false, status: 400 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(writeAtlas(SERVER, PATH, emptyDoc())).rejects.toThrow(/HTTP 400/)
  })
})
