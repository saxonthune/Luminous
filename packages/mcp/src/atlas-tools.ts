import {
  emptyAtlasDocument,
  parseAtlasDocument,
  serializeAtlasDocument,
  addNode,
  setNode,
  removeNode,
  reparent,
  addEdge,
  removeEdge,
  setLegend,
  buildBisectActions,
  applyAtlasBatch,
  parseAtlasData,
  resolveContent,
} from '@luminous/core/atlas'
import type {
  AtlasAction,
  AtlasColorToken,
  AtlasContent,
  AtlasData,
  AtlasDocument,
  AtlasEdge,
  AtlasLegend,
  AtlasNode,
} from '@luminous/core/atlas'

export async function loadAtlas(serverUrl: string, path: string): Promise<AtlasDocument> {
  const res = await fetch(`${serverUrl}/api/document/${encodeURIComponent(path)}`)
  if (!res.ok) {
    throw new Error(`Failed to read atlas document '${path}': HTTP ${res.status}`)
  }
  const text = JSON.stringify(await res.json())
  const parsed = parseAtlasDocument(text)
  if (!parsed.ok) {
    throw new Error(`Invalid atlas document '${path}': ${parsed.issues.join('; ')}`)
  }
  return parsed.doc
}

export async function writeAtlas(serverUrl: string, path: string, doc: AtlasDocument): Promise<void> {
  const content = JSON.parse(serializeAtlasDocument(doc))
  const res = await fetch(`${serverUrl}/api/document/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
  if (!res.ok) {
    throw new Error(`Failed to write atlas document '${path}': HTTP ${res.status}`)
  }
}

export async function listAtlases(serverUrl: string): Promise<{ paths: string[] }> {
  const res = await fetch(`${serverUrl}/api/documents`)
  if (!res.ok) {
    throw new Error(`Failed to list documents: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { documents?: { path: string }[] }
  const paths = (body.documents ?? [])
    .map((d) => d.path)
    .filter((p) => p.endsWith('.atlas.json'))
  return { paths }
}

export async function createAtlas(serverUrl: string, path: string): Promise<AtlasDocument> {
  if (!path.endsWith('.atlas.json')) {
    throw new Error(`path '${path}' must end with '.atlas.json'`)
  }
  const doc = emptyAtlasDocument()
  await writeAtlas(serverUrl, path, doc)
  return doc
}

const ATLAS_DOC_SUFFIX = '.atlas.json'
const ATLAS_DATA_SUFFIX = '.atlasdata.json'

function atlasDataPathFor(path: string): string {
  return path.endsWith(ATLAS_DOC_SUFFIX)
    ? path.slice(0, -ATLAS_DOC_SUFFIX.length) + ATLAS_DATA_SUFFIX
    : path + ATLAS_DATA_SUFFIX
}

/** Loads the Data File sidecar for an atlas Document, if one exists.
 * Mirrors the client's `dataLoader.ts`: a missing or unparsable sidecar is
 * the normal case for most Atlas documents, not an error. */
async function loadAtlasDataFile(serverUrl: string, path: string): Promise<AtlasData | undefined> {
  const dataPath = atlasDataPathFor(path)
  let res: Response
  try {
    res = await fetch(`${serverUrl}/api/atlasdata/${encodeURIComponent(dataPath)}`)
  } catch {
    return undefined
  }
  if (!res.ok) return undefined
  const text = JSON.stringify(await res.json())
  const parsed = parseAtlasData(text)
  return parsed.ok ? parsed.data : undefined
}

export interface AtlasFilledSlot {
  id: string
  from: string
  filled: boolean
}

export interface AtlasReadResult {
  document: AtlasDocument
  /** Every Node whose Content names a Data File key, `filled` reporting
   * whether that key currently resolves — so an agent reading the Atlas
   * knows not to paste contract text into a slot a script owns (doc "Atlas
   * Data File" phase), rather than only discovering that by trial and error
   * against `node/set`. */
  filledSlots: AtlasFilledSlot[]
}

export async function readAtlas(serverUrl: string, path: string): Promise<AtlasReadResult> {
  const document = await loadAtlas(serverUrl, path)
  const data = await loadAtlasDataFile(serverUrl, path)
  const filledSlots: AtlasFilledSlot[] = []
  for (const node of document.nodes) {
    const from = node.content?.from
    if (from === undefined) continue
    const resolved = resolveContent(node.content, data)
    filledSlots.push({ id: node.id, from, filled: resolved?.filled ?? false })
  }
  return { document, filledSlots }
}

export async function nodeCreate(
  serverUrl: string,
  path: string,
  fields: { id: string; name: string; parent?: string; x?: number; y?: number; color?: AtlasColorToken },
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const result = addNode(doc, fields)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function nodeSet(
  serverUrl: string,
  path: string,
  id: string,
  patch: {
    name?: string
    content?: AtlasContent
    x?: number
    y?: number
    color?: AtlasColorToken
    contentHeight?: number
    contentWidth?: number
  },
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  // The MCP dispatcher materializes every optional argument as a key whose
  // value is undefined. Core's setNode intentionally treats a present
  // undefined key as a request to clear that field, so strip those synthetic
  // keys here and preserve fields the MCP caller omitted.
  const providedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as typeof patch
  const result = setNode(doc, id, providedPatch)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function nodeReparent(
  serverUrl: string,
  path: string,
  id: string,
  parent: string | undefined,
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const result = reparent(doc, id, parent)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function nodeDelete(serverUrl: string, path: string, id: string): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const result = removeNode(doc, id)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function edgeConnect(
  serverUrl: string,
  path: string,
  from: string,
  to: string,
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const result = addEdge(doc, from, to)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function edgeDisconnect(
  serverUrl: string,
  path: string,
  from: string,
  to: string,
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const result = removeEdge(doc, from, to)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function edgeBisect(
  serverUrl: string,
  path: string,
  edge: { from: string; to: string },
  newNode: { id: string; name?: string; content?: AtlasContent; x?: number; y?: number; parent?: string },
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const actions = buildBisectActions(doc, edge, newNode)
  const result = applyAtlasBatch(doc, actions)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function legendSet(
  serverUrl: string,
  path: string,
  legend: AtlasLegend,
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const result = setLegend(doc, legend)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

export async function applyBatch(
  serverUrl: string,
  path: string,
  actions: AtlasAction[],
): Promise<AtlasDocument> {
  const doc = await loadAtlas(serverUrl, path)
  const result = applyAtlasBatch(doc, actions)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeAtlas(serverUrl, path, result.doc)
  return result.doc
}

function assertValidAtlasDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 0) {
    throw new Error(`depth must be a non-negative integer, got ${depth}`)
  }
}

export async function getAtlasNode(serverUrl: string, path: string, id: string): Promise<AtlasNode> {
  const doc = await loadAtlas(serverUrl, path)
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) {
    throw new Error(`Node '${id}' not found in atlas document '${path}'`)
  }
  return node
}

export async function searchAtlasNodes(serverUrl: string, path: string, text: string): Promise<{ nodes: AtlasNode[] }> {
  const doc = await loadAtlas(serverUrl, path)
  const needle = text.toLowerCase()
  const nodes = doc.nodes.filter(
    (n) =>
      n.id.toLowerCase().includes(needle) ||
      n.name.toLowerCase().includes(needle) ||
      (n.content?.text.toLowerCase().includes(needle) ?? false) ||
      (n.content?.from?.toLowerCase().includes(needle) ?? false),
  )
  return { nodes }
}

export async function listAtlasChildren(
  serverUrl: string,
  path: string,
  id: string,
  depth = 1,
): Promise<{ nodes: AtlasNode[] }> {
  const doc = await loadAtlas(serverUrl, path)
  assertValidAtlasDepth(depth)
  if (!doc.nodes.some((n) => n.id === id)) {
    throw new Error(`Node '${id}' not found in atlas document '${path}'`)
  }
  if (depth === 0) {
    return { nodes: [] }
  }

  const childrenOf = new Map<string, string[]>()
  for (const node of doc.nodes) {
    if (node.parent === undefined) continue
    const list = childrenOf.get(node.parent) ?? []
    list.push(node.id)
    childrenOf.set(node.parent, list)
  }

  const included = new Set<string>()
  let frontier = [id]
  for (let step = 0; step < depth && frontier.length > 0; step++) {
    const next: string[] = []
    for (const parentId of frontier) {
      for (const childId of childrenOf.get(parentId) ?? []) {
        if (!included.has(childId)) {
          included.add(childId)
          next.push(childId)
        }
      }
    }
    frontier = next
  }

  return { nodes: doc.nodes.filter((n) => included.has(n.id)) }
}

export async function listAtlasEdges(
  serverUrl: string,
  path: string,
  from?: string,
  to?: string,
): Promise<{ edges: AtlasEdge[] }> {
  const doc = await loadAtlas(serverUrl, path)
  const edges = doc.edges.filter((e) => (from === undefined || e.from === from) && (to === undefined || e.to === to))
  return { edges }
}

const ATLAS_NEIGHBORHOOD_DIRECTIONS = ['out', 'in', 'both'] as const
export type AtlasNeighborhoodDirection = (typeof ATLAS_NEIGHBORHOOD_DIRECTIONS)[number]

function edgeKey(edge: AtlasEdge): string {
  return `${edge.from} ${edge.to}`
}

export async function atlasNeighborhood(
  serverUrl: string,
  path: string,
  id: string,
  direction: AtlasNeighborhoodDirection = 'both',
  depth = 1,
): Promise<{ nodes: AtlasNode[]; edges: AtlasEdge[] }> {
  const doc = await loadAtlas(serverUrl, path)
  if (!(ATLAS_NEIGHBORHOOD_DIRECTIONS as readonly string[]).includes(direction)) {
    throw new Error(`direction must be one of 'out', 'in', 'both', got '${direction}'`)
  }
  assertValidAtlasDepth(depth)
  if (!doc.nodes.some((n) => n.id === id)) {
    throw new Error(`Node '${id}' not found in atlas document '${path}'`)
  }

  const visited = new Set<string>([id])
  const edgeKeys = new Set<string>()
  const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]
    if (current.depth >= depth) continue
    for (const edge of doc.edges) {
      let neighbor: string | undefined
      if ((direction === 'out' || direction === 'both') && edge.from === current.id) {
        neighbor = edge.to
      } else if ((direction === 'in' || direction === 'both') && edge.to === current.id) {
        neighbor = edge.from
      } else {
        continue
      }
      edgeKeys.add(edgeKey(edge))
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push({ id: neighbor, depth: current.depth + 1 })
      }
    }
  }

  return {
    nodes: doc.nodes.filter((n) => visited.has(n.id)),
    edges: doc.edges.filter((e) => edgeKeys.has(edgeKey(e))),
  }
}
