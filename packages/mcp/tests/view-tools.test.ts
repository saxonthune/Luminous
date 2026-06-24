import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listViews, project } from '../src/view-tools.js'

const SERVER = 'http://localhost:4080'
const PATH = 'test.graph.json'

// Graph: n1 and n2 are spatial (prim.box), n3 is latent (prim.chip)
// Edges: e1 is an arrow (prim.arrow) n1→n2, e2 is a summary (prim.summary) n1→n3
//        e3 is a contain edge (prim.contain) n2→n1 (n2 contains n1)
const MOCK_DOCUMENT = {
  version: 3,
  pack: 'test-pack',
  defaultView: 'view-flat',
  nodes: [
    { id: 'n1', kind: 'prim.box', props: { label: 'Box 1' }, tags: [] },
    { id: 'n2', kind: 'prim.box', props: { label: 'Box 2' }, tags: [] },
    { id: 'n3', kind: 'prim.chip', props: { label: 'Chip' }, tags: [] },
  ],
  edges: [
    { id: 'e1', kind: 'prim.arrow', from: 'n1', to: 'n2', props: {}, tags: [] },
    { id: 'e2', kind: 'prim.summary', from: 'n1', to: 'n3', props: {}, tags: [] },
    { id: 'e3', kind: 'prim.contain', from: 'n2', to: 'n1', props: {}, tags: [] },
  ],
}

// Two views: flat (arrow + summary, no containment) and nested (contain)
const VIEW_FLAT = {
  id: 'view-flat',
  name: 'Flat',
  description: 'Flat layout with arrows and chips',
  nodeRoles: { 'prim.box': 'spatial', 'prim.chip': 'latent' },
  edgeRoles: { 'prim.arrow': 'arrow', 'prim.summary': 'summary', 'prim.contain': 'hidden' },
  layers: {},
  layout: { algorithm: 'dagre' },
}

const VIEW_NESTED = {
  id: 'view-nested',
  name: 'Nested',
  description: 'Containment layout',
  nodeRoles: { 'prim.box': 'spatial', 'prim.chip': 'hidden' },
  edgeRoles: { 'prim.arrow': 'hidden', 'prim.summary': 'hidden', 'prim.contain': 'contain' },
  layers: {},
  layout: { algorithm: 'elk' },
}

const MOCK_PACK = {
  id: 'test-pack',
  version: '1.0.0',
  nodeKinds: [],
  edgeKinds: [],
  layers: [],
  disclosureSchemas: [],
  views: [VIEW_FLAT, VIEW_NESTED],
}

function makeFetch(...responses: Array<{ ok: boolean; json: () => Promise<unknown> }>) {
  const mock = vi.fn()
  for (const r of responses) {
    mock.mockResolvedValueOnce(r)
  }
  return mock
}

function docResponse(doc = MOCK_DOCUMENT) {
  return { ok: true, json: async () => doc }
}

function packResponse(pack = MOCK_PACK) {
  return { ok: true, json: async () => pack }
}

describe('listViews', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns both views with their role maps', async () => {
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse()))
    const { views } = await listViews(SERVER, PATH)
    expect(views).toHaveLength(2)
    expect(views[0].id).toBe('view-flat')
    expect(views[1].id).toBe('view-nested')
    expect(views[0].nodeRoles).toEqual(VIEW_FLAT.nodeRoles)
    expect(views[0].edgeRoles).toEqual(VIEW_FLAT.edgeRoles)
    expect(views[1].nodeRoles).toEqual(VIEW_NESTED.nodeRoles)
  })

  it('includes description when present', async () => {
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse()))
    const { views } = await listViews(SERVER, PATH)
    expect(views[0].description).toBe('Flat layout with arrows and chips')
  })

  it('includes layout', async () => {
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse()))
    const { views } = await listViews(SERVER, PATH)
    expect(views[0].layout).toEqual({ algorithm: 'dagre' })
    expect(views[1].layout).toEqual({ algorithm: 'elk' })
  })
})

describe('project — flat view', () => {
  beforeEach(() => {
    // project calls: loadViews (doc + pack) then loadGraph (doc again)
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse(), docResponse()))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('partitions nodes into spatial and latent', async () => {
    const scene = await project(SERVER, PATH, 'view-flat')
    const spatialIds = scene.spatialNodes.map((n) => n.id).sort()
    const latentIds = scene.latentNodes.map((n) => n.id).sort()
    expect(spatialIds).toEqual(['n1', 'n2'])
    expect(latentIds).toEqual(['n3'])
  })

  it('produces arrows and summaryEdges per edge roles', async () => {
    const scene = await project(SERVER, PATH, 'view-flat')
    expect(scene.arrows).toHaveLength(1)
    expect(scene.arrows[0].id).toBe('e1')
    expect(scene.summaryEdges).toHaveLength(1)
    expect(scene.summaryEdges[0].id).toBe('e2')
  })

  it('serializes containment Maps to plain objects', async () => {
    const scene = await project(SERVER, PATH, 'view-flat')
    expect(Array.isArray(scene.containment.rootIds)).toBe(true)
    expect(scene.containment.childrenOf).not.toBeInstanceOf(Map)
    expect(scene.containment.parentOf).not.toBeInstanceOf(Map)
    // flat view has no contain edges → all spatial nodes are roots
    expect(scene.containment.rootIds.sort()).toEqual(['n1', 'n2'])
    expect(scene.containment.childrenOf).toEqual({})
    expect(scene.containment.parentOf).toEqual({})
  })

  it('includes viewId in result', async () => {
    const scene = await project(SERVER, PATH, 'view-flat')
    expect(scene.viewId).toBe('view-flat')
  })

  it('peekNodes is empty (MCP calls evaluateView without gating)', async () => {
    const scene = await project(SERVER, PATH, 'view-flat')
    expect(scene.peekNodes).toHaveLength(0)
  })
})

describe('project — nested view', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse(), docResponse()))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('builds containment from contain-role edges', async () => {
    const scene = await project(SERVER, PATH, 'view-nested')
    // e3: prim.contain, from: n2, to: n1 → n2 is child of n1
    // evaluateContainment: child = edge.from (n2), parent = edge.to (n1)
    expect(scene.containment.parentOf['n2']).toBe('n1')
    expect(scene.containment.childrenOf['n1']).toContain('n2')
    expect(scene.containment.rootIds).toContain('n1')
    expect(scene.containment.rootIds).not.toContain('n2')
  })
})

describe('project — defaultView fallback', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses canvas defaultView when viewId is omitted', async () => {
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse(), docResponse()))
    const scene = await project(SERVER, PATH)
    expect(scene.viewId).toBe('view-flat')
  })

  it('errors when no viewId and no defaultView', async () => {
    const docNoDefault = { ...MOCK_DOCUMENT, defaultView: undefined }
    vi.stubGlobal('fetch', makeFetch(docResponse(docNoDefault as typeof MOCK_DOCUMENT), packResponse()))
    await expect(project(SERVER, PATH)).rejects.toThrow(/no defaultView/)
  })
})

describe('project — unknown viewId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('errors with a message listing available view ids', async () => {
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse()))
    await expect(project(SERVER, PATH, 'nonexistent')).rejects.toThrow(/view-flat.*view-nested|view-nested.*view-flat/)
  })
})

describe('project — warnings passthrough', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('includes latent-without-summary warning for latent node with no summary edge', async () => {
    // n3 is latent in view-flat and e2 is a summary from n1→n3, so no warning here.
    // Create a doc where the latent node has no summary edge.
    const docNoSummary = {
      ...MOCK_DOCUMENT,
      edges: [
        { id: 'e1', kind: 'prim.arrow', from: 'n1', to: 'n2', props: {}, tags: [] },
        // no summary edge for n3
      ],
    }
    vi.stubGlobal('fetch', makeFetch(docResponse(docNoSummary as typeof MOCK_DOCUMENT), packResponse(), docResponse(docNoSummary as typeof MOCK_DOCUMENT)))
    const scene = await project(SERVER, PATH, 'view-flat')
    const warning = scene.warnings.find((w) => w.code === 'latent-without-summary')
    expect(warning).toBeDefined()
    expect(warning?.id).toBe('n3')
  })
})

describe('JSON serialization safety', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('produces a JSON-safe result (no Map instances)', async () => {
    vi.stubGlobal('fetch', makeFetch(docResponse(), packResponse(), docResponse()))
    const scene = await project(SERVER, PATH, 'view-flat')
    expect(() => JSON.stringify(scene)).not.toThrow()
    const reparsed = JSON.parse(JSON.stringify(scene))
    expect(reparsed.containment.childrenOf).toBeDefined()
    expect(reparsed.containment.parentOf).toBeDefined()
  })
})
