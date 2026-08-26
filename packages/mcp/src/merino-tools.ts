import {
  emptyMerinoDocument,
  parseMerinoDocument,
  serializeMerinoDocument,
  addNode,
  setNode,
  removeNode,
  connect,
  setEdge,
  disconnect,
  addNodeType,
  setNodeType,
  removeNodeType,
  addEdgeType,
  setEdgeType,
  removeEdgeType,
  applyMerinoBatch,
  checkMerinoDocument,
} from '@luminous/core/merino'
import type {
  MerinoAction,
  MerinoColorToken,
  MerinoDash,
  MerinoDocument,
  MerinoNode,
  MerinoResult,
  MerinoTab,
} from '@luminous/core/merino'

const MERINO_DOC_SUFFIX = '.merino.json'

export async function loadMerino(serverUrl: string, path: string): Promise<MerinoDocument> {
  const res = await fetch(`${serverUrl}/api/document/${encodeURIComponent(path)}`)
  if (!res.ok) {
    throw new Error(`Failed to read merino document '${path}': HTTP ${res.status}`)
  }
  const text = JSON.stringify(await res.json())
  const parsed = parseMerinoDocument(text)
  if (!parsed.ok) {
    throw new Error(`Invalid merino document '${path}': ${parsed.issues.join('; ')}`)
  }
  return parsed.doc
}

export async function writeMerino(serverUrl: string, path: string, doc: MerinoDocument): Promise<void> {
  const content = JSON.parse(serializeMerinoDocument(doc))
  const res = await fetch(`${serverUrl}/api/document/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
  if (!res.ok) {
    throw new Error(`Failed to write merino document '${path}': HTTP ${res.status}`)
  }
}

/** Every write reports the check result alongside — issues never block the
 * write, but the author always sees them. */
export interface MerinoWriteResult {
  document: MerinoDocument
  issues: ReturnType<typeof checkMerinoDocument>
}

async function commit(serverUrl: string, path: string, result: MerinoResult): Promise<MerinoWriteResult> {
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeMerino(serverUrl, path, result.doc)
  return { document: result.doc, issues: checkMerinoDocument(result.doc) }
}

/** The MCP dispatcher materializes every optional argument as a key whose value
 * is undefined; core's setters treat a present undefined key as a clear
 * request, so strip the synthetic keys before patching. */
function provided<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}

export async function listMerinos(serverUrl: string): Promise<{ paths: string[] }> {
  const res = await fetch(`${serverUrl}/api/documents`)
  if (!res.ok) {
    throw new Error(`Failed to list documents: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { documents?: { path: string }[] }
  const paths = (body.documents ?? []).map((d) => d.path).filter((p) => p.endsWith(MERINO_DOC_SUFFIX))
  return { paths }
}

export async function createMerino(serverUrl: string, path: string): Promise<MerinoDocument> {
  if (!path.endsWith(MERINO_DOC_SUFFIX)) {
    throw new Error(`path '${path}' must end with '${MERINO_DOC_SUFFIX}'`)
  }
  const doc = emptyMerinoDocument()
  await writeMerino(serverUrl, path, doc)
  return doc
}

export async function readMerino(serverUrl: string, path: string): Promise<MerinoWriteResult> {
  const document = await loadMerino(serverUrl, path)
  return { document, issues: checkMerinoDocument(document) }
}

export async function getMerinoNode(serverUrl: string, path: string, id: string): Promise<MerinoNode> {
  const doc = await loadMerino(serverUrl, path)
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) {
    throw new Error(`Node '${id}' not found in merino document '${path}'`)
  }
  return node
}

export async function merinoNodeCreate(
  serverUrl: string,
  path: string,
  fields: { id: string; tab: MerinoTab; nodeType: string; name: string; text?: string; parent?: string; x?: number; y?: number },
): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, addNode(doc, fields))
}

export async function merinoNodeSet(
  serverUrl: string,
  path: string,
  id: string,
  patch: { name?: string; text?: string; nodeType?: string; parent?: string; x?: number; y?: number },
): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, setNode(doc, id, provided(patch)))
}

export async function merinoNodeDelete(serverUrl: string, path: string, id: string): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, removeNode(doc, id))
}

export async function merinoConnect(
  serverUrl: string,
  path: string,
  fields: { id: string; edgeType: string; from: string; to: string },
): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, connect(doc, fields))
}

export async function merinoSetEdge(serverUrl: string, path: string, id: string, edgeType: string): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, setEdge(doc, id, edgeType))
}

export async function merinoDisconnect(serverUrl: string, path: string, id: string): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, disconnect(doc, id))
}

export async function merinoNodeTypeAdd(
  serverUrl: string,
  path: string,
  fields: { id: string; name: string; color: MerinoColorToken },
): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, addNodeType(doc, fields))
}

export async function merinoNodeTypeSet(
  serverUrl: string,
  path: string,
  id: string,
  patch: { name?: string; color?: MerinoColorToken },
): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, setNodeType(doc, id, provided(patch)))
}

export async function merinoNodeTypeRemove(serverUrl: string, path: string, id: string): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, removeNodeType(doc, id))
}

export async function merinoEdgeTypeAdd(
  serverUrl: string,
  path: string,
  fields: { id: string; name: string; color: MerinoColorToken; dash: MerinoDash; arrowHead: boolean; directed: boolean },
): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, addEdgeType(doc, fields))
}

export async function merinoEdgeTypeSet(
  serverUrl: string,
  path: string,
  id: string,
  patch: { name?: string; color?: MerinoColorToken; dash?: MerinoDash; arrowHead?: boolean; directed?: boolean },
): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, setEdgeType(doc, id, provided(patch)))
}

export async function merinoEdgeTypeRemove(serverUrl: string, path: string, id: string): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, removeEdgeType(doc, id))
}

export async function merinoBatch(serverUrl: string, path: string, actions: MerinoAction[]): Promise<MerinoWriteResult> {
  const doc = await loadMerino(serverUrl, path)
  return commit(serverUrl, path, applyMerinoBatch(doc, actions))
}

export async function merinoCheck(serverUrl: string, path: string): Promise<{ issues: ReturnType<typeof checkMerinoDocument> }> {
  const doc = await loadMerino(serverUrl, path)
  return { issues: checkMerinoDocument(doc) }
}
