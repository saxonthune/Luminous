import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  loadLinen,
  listLinens,
  createLinen,
  linenModuleCreate,
  linenContractCreate,
  linenNodeCreate,
  linenConnect,
  linenBatch,
  linenCheck,
  linenTrace,
  linenManifest,
} from '../src/linen-tools.js'

const SERVER = 'http://localhost:4080'
const PATH = 'nyc-subwhere.linen.json'

/** An in-memory store standing in for the storage server: reads serve the
 * held document, writes replace it — so multi-step round-trips exercise the
 * real load -> operate -> write path. */
function stubStore(initial: unknown) {
  const store = { doc: initial }
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.startsWith(`${SERVER}/api/document/`)) {
      return { ok: true, status: 200, json: async () => store.doc } as Response
    }
    if (method === 'POST' && url === `${SERVER}/api/document/write`) {
      store.doc = (JSON.parse(String(init?.body)) as { content: unknown }).content
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response
    }
    if (method === 'GET' && url === `${SERVER}/api/documents`) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          documents: [{ path: PATH }, { path: 'other.atlas.json' }, { path: 'x.graph.json' }],
        }),
      } as Response
    }
    throw new Error(`unexpected fetch: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return store
}

function emptyDoc() {
  return { v: 1, modules: [], contracts: [], nodes: [], edges: [] }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listLinens', () => {
  it('filters to paths ending .linen.json', async () => {
    stubStore(emptyDoc())
    const result = await listLinens(SERVER)
    expect(result.paths).toEqual([PATH])
  })
})

describe('createLinen', () => {
  it('rejects a path without the suffix', async () => {
    stubStore(emptyDoc())
    await expect(createLinen(SERVER, 'nope.atlas.json')).rejects.toThrow(/must end with/)
  })
})

describe('create -> build -> trace round-trip', () => {
  it('walks the Trace with the derived resume Contract at the Pass', async () => {
    const store = stubStore(emptyDoc())
    await createLinen(SERVER, PATH)
    await linenModuleCreate(SERVER, PATH, { id: 'worker', name: 'Worker' })
    await linenModuleCreate(SERVER, PATH, { id: 'kv', name: 'KV' })
    await linenContractCreate(SERVER, PATH, { id: 'snapshot', name: 'RenderSnapshot', owner: 'kv' })
    await linenConnect(SERVER, PATH, 'kv', 'snapshot')
    await linenNodeCreate(SERVER, PATH, { id: 'alarm', kind: 'entry', module: 'worker', annotation: 'alarm fires' })
    await linenNodeCreate(SERVER, PATH, { id: 'store', kind: 'pass', module: 'worker', to: 'kv' })
    await linenNodeCreate(SERVER, PATH, { id: 'done', kind: 'release-control', module: 'worker' })
    await linenBatch(SERVER, PATH, [
      { type: 'connect', from: 'alarm', to: 'store' },
      { type: 'connect', from: 'store', to: 'done' },
    ])

    const trace = await linenTrace(SERVER, PATH, 'alarm')
    expect(trace.steps.map((s) => s.id)).toEqual(['alarm', 'store', 'done'])
    expect(trace.steps[0]).toMatchObject({ term: 'Entry', annotation: 'alarm fires' })
    expect(trace.steps[1]).toMatchObject({ to: 'kv', resumeContract: 'snapshot' })

    const manifest = await linenManifest(SERVER, PATH, 'worker')
    expect(manifest.passes).toEqual([{ node: 'store', to: 'kv', resumeContract: 'snapshot' }])

    const written = await loadLinen(SERVER, PATH)
    expect(written.nodes).toHaveLength(3)
    expect(store.doc).toEqual(JSON.parse(JSON.stringify(written)))
  })
})

describe('linenCheck', () => {
  it('surfaces a descriptor-rule violation', async () => {
    stubStore({
      v: 1,
      modules: [{ id: 'm', name: 'M' }],
      contracts: [],
      nodes: [
        { id: 'e', kind: 'entry', module: 'm' },
        { id: 'r', kind: 'return', module: 'm' },
        { id: 't', kind: 'transformation', module: 'm' },
      ],
      edges: [
        { from: 'e', to: 'r' },
        { from: 'r', to: 't' },
      ],
    })
    const result = await linenCheck(SERVER, PATH)
    expect(
      result.issues.some(
        (i) => i.severity === 'error' && i.message.includes('Return "r" terminates the Trace'),
      ),
    ).toBe(true)
  })
})

describe('linenNodeCreate', () => {
  it('rejects an unknown kind with the allowed list in the error', async () => {
    stubStore({ v: 1, modules: [{ id: 'm', name: 'M' }], contracts: [], nodes: [], edges: [] })
    await expect(
      linenNodeCreate(SERVER, PATH, { id: 'w', kind: 'widget', module: 'm' }),
    ).rejects.toThrow(/entry, filter, switch, transformation, type, pass, return, release-control/)
  })

  it('reports the no-Contract-connected warning alongside the write', async () => {
    stubStore({
      v: 1,
      modules: [
        { id: 'worker', name: 'Worker' },
        { id: 'kv', name: 'KV' },
      ],
      contracts: [],
      nodes: [],
      edges: [],
    })
    const result = await linenNodeCreate(SERVER, PATH, { id: 'store', kind: 'pass', module: 'worker', to: 'kv' })
    expect(result.issues.some((i) => i.severity === 'warning' && i.message.includes('no Contract connected'))).toBe(true)
  })
})
