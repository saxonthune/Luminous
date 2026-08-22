import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  loadDataflow,
  writeDataflow,
  listDataflows,
  createDataflow,
  readDataflow,
  addBoxTool,
  setBoxTool,
  connectTool,
  disconnectTool,
  removeBoxTool,
  checkTool,
  batchTool,
} from '../src/dataflow-tools.js'

const SERVER = 'http://localhost:4080'
const PATH = 'checkout.dataflow.json'

function emptyDoc() {
  return { v: 1, boxes: [], flows: [] }
}

function docWithTwoBoxes() {
  return {
    v: 1,
    boxes: [
      { id: 'client', name: 'Client' },
      { id: 'server', name: 'Server' },
    ],
    flows: [],
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

describe('loadDataflow', () => {
  it('parses a valid document from the server', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoBoxes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await loadDataflow(SERVER, PATH)
    expect(doc.boxes).toHaveLength(2)
  })

  it('throws a readable error on malformed documents', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => ({ v: 1, boxes: 'oops', flows: [] }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadDataflow(SERVER, PATH)).rejects.toThrow(/boxes/)
  })
})

describe('listDataflows', () => {
  it('filters to paths ending .dataflow.json', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/documents`]: () => ({
        ok: true,
        json: async () => ({
          documents: [
            { path: 'checkout.dataflow.json' },
            { path: 'overview.graph.json' },
            { path: 'payments.dataflow.json' },
          ],
        }),
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { paths } = await listDataflows(SERVER)
    expect(paths).toEqual(['checkout.dataflow.json', 'payments.dataflow.json'])
  })
})

describe('createDataflow', () => {
  it('rejects paths that do not end .dataflow.json', async () => {
    await expect(createDataflow(SERVER, 'overview.graph.json')).rejects.toThrow(/dataflow\.json/)
  })

  it('writes an empty document for a valid path', async () => {
    const fetchMock = mockFetch({
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await createDataflow(SERVER, PATH)
    expect(doc).toEqual(emptyDoc())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.path).toBe(PATH)
    expect(body.content).toEqual(emptyDoc())
  })
})

describe('readDataflow', () => {
  it('returns the parsed document', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoBoxes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await readDataflow(SERVER, PATH)
    expect(doc.boxes.map((b) => b.id)).toEqual(['client', 'server'])
  })
})

describe('addBoxTool', () => {
  it('writes the mutated document and returns the new id', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { id } = await addBoxTool(SERVER, PATH, { name: 'Payment Processor' })
    expect(id).toBe('payment-processor')
    const writeCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/document/write'))
    const body = JSON.parse((writeCall![1] as RequestInit).body as string)
    expect(body.content.boxes).toHaveLength(1)
    expect(body.content.boxes[0].name).toBe('Payment Processor')
  })

  it('carries the group through', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await addBoxTool(SERVER, PATH, { name: 'Payment Processor', group: 'checkout' })
    const writeCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/document/write'))
    const body = JSON.parse((writeCall![1] as RequestInit).body as string)
    expect(body.content.boxes[0].group).toBe('checkout')
  })
})

describe('setBoxTool / connectTool / disconnectTool / removeBoxTool', () => {
  it('setBoxTool renames a box and writes once', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoBoxes() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await setBoxTool(SERVER, PATH, 'client', { name: 'Browser' })
    expect(doc.boxes.find((b) => b.id === 'client')!.name).toBe('Browser')
  })

  it('setBoxTool sets and clears a group', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoBoxes() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await setBoxTool(SERVER, PATH, 'client', { group: 'checkout' })
    expect(doc.boxes.find((b) => b.id === 'client')!.group).toBe('checkout')

    const fetchMock2 = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock2)
    const cleared = await setBoxTool(SERVER, PATH, 'client', { group: null })
    expect(cleared.boxes.find((b) => b.id === 'client')!.group).toBeUndefined()
  })

  it('connectTool adds a flow', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoBoxes() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await connectTool(SERVER, PATH, 'client', 'server')
    expect(doc.flows).toEqual([{ from: 'client', to: 'server' }])
  })

  it('connectTool rejects an unknown endpoint and writes nothing', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoBoxes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(connectTool(SERVER, PATH, 'client', 'missing')).rejects.toThrow(/missing/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('disconnectTool removes a flow', async () => {
    const doc = { ...docWithTwoBoxes(), flows: [{ from: 'client', to: 'server' }] }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await disconnectTool(SERVER, PATH, 'client', 'server')
    expect(result.flows).toEqual([])
  })

  it('removeBoxTool refuses when flows attach unless cascade is set', async () => {
    const doc = { ...docWithTwoBoxes(), flows: [{ from: 'client', to: 'server' }] }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(removeBoxTool(SERVER, PATH, 'client')).rejects.toThrow(/cascade/)
  })

  it('removeBoxTool cascades when requested', async () => {
    const doc = { ...docWithTwoBoxes(), flows: [{ from: 'client', to: 'server' }] }
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => doc }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await removeBoxTool(SERVER, PATH, 'client', true)
    expect(result.boxes.map((b) => b.id)).toEqual(['server'])
    expect(result.flows).toEqual([])
  })
})

describe('checkTool', () => {
  it('reports orphan boxes as warnings', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => docWithTwoBoxes() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { issues } = await checkTool(SERVER, PATH)
    expect(issues.every((i) => i.severity === 'warning')).toBe(true)
    expect(issues).toHaveLength(2)
  })
})

describe('batchTool', () => {
  it('writes once on success', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: true, json: async () => ({ ok: true }) }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await batchTool(SERVER, PATH, [
      { type: 'addBox', name: 'Client' },
      { type: 'addBox', name: 'Server' },
      { type: 'connect', from: 'client', to: 'server' },
    ])
    expect(doc.boxes).toHaveLength(2)
    expect(doc.flows).toEqual([{ from: 'client', to: 'server' }])
    const writeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/document/write'))
    expect(writeCalls).toHaveLength(1)
  })

  it('writes nothing when a later action fails', async () => {
    const fetchMock = mockFetch({
      [`GET ${SERVER}/api/document/`]: () => ({ ok: true, json: async () => emptyDoc() }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      batchTool(SERVER, PATH, [
        { type: 'addBox', name: 'Client' },
        { type: 'connect', from: 'client', to: 'missing' },
      ]),
    ).rejects.toThrow(/missing/)
    const writeCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/document/write'))
    expect(writeCalls).toHaveLength(0)
  })
})

describe('writeDataflow', () => {
  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = mockFetch({
      [`POST ${SERVER}/api/document/write`]: () => ({ ok: false, status: 400 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(writeDataflow(SERVER, PATH, emptyDoc())).rejects.toThrow(/HTTP 400/)
  })
})
