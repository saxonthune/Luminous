export interface DocumentMeta {
  path: string
  name: string
  lastModified: number
}

export interface NodeBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  parentId: string | null
}

export interface NoteNode extends NodeBase {
  type: 'note'
  title: string
  body: string
}

export interface PortalNode extends NodeBase {
  type: 'portal'
  title: string
  canvasRef: string
}

export type Node = NoteNode | PortalNode

/** Backward-compat alias — use Node for new code */
export type Note = Node

export interface Edge {
  id: string
  fromId: string
  toId: string
  label: string | null
}

export interface Document {
  notes: Record<string, Node>
  edges: Record<string, Edge>
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch('/api/documents')
  const data = await res.json()
  return data.documents
}

export async function getDocument(path: string): Promise<Document> {
  const url = `/api/document/${encodeURIComponent(path)}`
  console.log(`[api] GET ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    console.error(`[api] GET ${url} failed (${res.status}):`, text)
    throw new Error(`Failed to load document: ${res.status}`)
  }
  const doc = await res.json()
  console.log(`[api] loaded document: ${path}`, { notes: Object.keys(doc.notes ?? {}).length, edges: Object.keys(doc.edges ?? {}).length })
  return doc
}

export async function postAction(
  action: string,
  params: Record<string, unknown>
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch(`/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const result = await res.json()
  if (!result.ok) {
    console.error(`[api] POST /api/${action} failed:`, result.error, params)
  }
  return result
}

export async function postBatch(
  path: string,
  actions: Array<{ action: string; params: Record<string, unknown>; ref?: string }>
): Promise<{ ok: boolean; results: Array<{ ok: boolean; id?: string; ref?: string; error?: string }> }> {
  const res = await fetch('/api/action/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, actions }),
  })
  const result = await res.json()
  if (!result.ok) {
    console.error('[api] POST /api/action/batch failed:', result, actions)
  }
  return result
}
