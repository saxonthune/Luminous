export interface DocumentMeta {
  path: string
  name: string
  lastModified: number
}

export interface Edge {
  id: string
  fromId: string
  toId: string
  label: string | null
  /** Optional reference to an edge schema. Forward-looking; safe to ignore. */
  schemaName?: string
}

// ===========================================================================
// v2 — schema-driven node data model
// ===========================================================================

/** A vertical primitive in a schema. */
export interface PrimitiveDef {
  /** Renderer dispatch key, e.g. 'drag-bar', 'title', 'markdown', 'container'. */
  type: string
  /** Content field this primitive reads from. Required for content-bearing primitives. */
  bind?: string
  /** Container primitives only — the slot name of this region. */
  name?: string
}

/** A schema declares what a kind of node "is": its primitives and constraints. */
export interface Schema {
  /** Key into the document's schemas table; nodes reference this via schemaName. */
  name: string
  /** Human-readable label, used in drag bars and context menus. */
  label: string
  /** Ordered list of primitives, rendered top-to-bottom inside the node. */
  primitives: PrimitiveDef[]
  /** For container schemas: which child schemaNames are allowed inside. Absent = any. */
  accepts?: string[]
}

/** Position and size of a node, relative to its parent. */
export interface Geometry {
  x: number
  y: number
  w: number
  h: number
}

/** Structural facts about a node — what cactus reads. No content. */
export interface NodeStructure {
  id: string
  /** Resolves into the document's schemas table. */
  schemaName: string
  /** Single parent pointer. null = top-level (root of canvas). */
  parent: string | null
  /** Fractional index for sibling ordering. Insertable without renumbering. */
  order: string
  geometry: Geometry
}

/** Content for a node — type-specific field values, addressed by primitive `bind`. */
export type NodeContent = Record<string, unknown>

/** v2 canvas document. Four flat hashtables keyed by id. */
export interface Document {
  version: 2
  schemas:   Record<string, Schema>
  structure: Record<string, NodeStructure>
  content:   Record<string, NodeContent>
  edges:     Record<string, Edge>
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch('/api/documents')
  const data = await res.json()
  return data.documents
}

export async function getDocument(path: string): Promise<unknown> {
  const url = `/api/document/${encodeURIComponent(path)}`
  console.log(`[api] GET ${url}`)
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    console.error(`[api] GET ${url} failed (${res.status}):`, text)
    throw new Error(`Failed to load document: ${res.status}`)
  }
  const doc = await res.json()
  console.log(`[api] loaded document: ${path}`, {
    version: (doc as any)?.version,
    nodes: Object.keys((doc as any)?.structure ?? {}).length,
    edges: Object.keys((doc as any)?.edges ?? {}).length,
  })
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
