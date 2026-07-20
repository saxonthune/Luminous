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
  buildBisectActions,
  applyAtlasBatch,
} from '@luminous/core/atlas'
import type {
  AtlasAction,
  AtlasColorToken,
  AtlasContent,
  AtlasDocument,
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

export async function readAtlas(serverUrl: string, path: string): Promise<AtlasDocument> {
  return loadAtlas(serverUrl, path)
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
  const result = setNode(doc, id, patch)
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
