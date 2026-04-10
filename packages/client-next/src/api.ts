export interface DocumentMeta {
  path: string
  name: string
  lastModified: number
}

export type EdgeSide = 'top' | 'bottom' | 'left' | 'right'

export interface EdgeRouting {
  exitSide: EdgeSide
  enterSide: EdgeSide
}

export interface Edge {
  id: string
  fromId: string
  toId: string
  label: string | null
  /** Optional reference to an edge schema. Forward-looking; safe to ignore. */
  schemaName?: string
  /** Declarative routing — which side to exit/enter. If absent, straight line. */
  routing?: EdgeRouting
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

/** Visual style for an edge schema. Wiring to renderers is deferred. */
export interface EdgeStyle {
  stroke?: string
  strokeWidth?: number
  dashArray?: string
  arrowHead?: 'none' | 'triangle' | 'open'
}

/** A schema describing a node kind: its primitives and containment constraints. */
export interface NodeSchema {
  /** Discriminant. Optional for backwards compatibility — undefined means 'node'. */
  kind?: 'node'
  /** Key into the document's schemas table; nodes reference this via schemaName. */
  name: string
  /** Human-readable label, used in drag bars and context menus. */
  label: string
  /** Ordered list of primitives, rendered top-to-bottom inside the node. */
  primitives: PrimitiveDef[]
  /** For container schemas: which child schemaNames are allowed inside. Absent = any. */
  accepts?: string[]
  /** Short description shown in the legend modal. */
  legendDescription?: string
}

/** A schema describing an edge kind: its directionality and layout role. */
export interface EdgeSchema {
  /** Discriminant. Required to distinguish from NodeSchema. */
  kind: 'edge'
  /** Key into the document's schemas table; edges reference this via schemaName. */
  name: string
  /** Human-readable label, used in UI. */
  label: string
  /** Whether the edge is directed. Default false. */
  directed?: boolean
  /** If 'tree', this edge participates in layered tree layout. */
  layoutRole?: 'tree' | null
  /** Visual style; rendering is deferred. */
  style?: EdgeStyle
  /** Node schemaNames legal at fromId (UI hint only, not enforced). */
  acceptsSource?: string[]
  /** Node schemaNames legal at toId (UI hint only, not enforced). */
  acceptsTarget?: string[]
  /** Short description shown in the legend modal. */
  legendDescription?: string
}

/** A schema declares what a kind of node or edge "is". */
export type Schema = NodeSchema | EdgeSchema

/** Type guard: true when `s` is an EdgeSchema. */
export function isEdgeSchema(s: Schema): s is EdgeSchema {
  return s.kind === 'edge'
}

/** Type guard: true when `s` is a NodeSchema (kind undefined or 'node'). */
export function isNodeSchema(s: Schema): s is NodeSchema {
  return s.kind !== 'edge'
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

/** Optional legend metadata for a canvas document. */
export interface Legend {
  /** Markdown blurb describing the canvas. */
  blurb: string
}

/** v2 canvas document. Four flat hashtables keyed by id. */
export interface Document {
  version: 2
  schemas:   Record<string, Schema>
  structure: Record<string, NodeStructure>
  content:   Record<string, NodeContent>
  edges:     Record<string, Edge>
  /** Optional legend — when present, the viewer shows an info button. */
  legend?:   Legend
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

// ===========================================================================
// Persistence adapter
// ===========================================================================

export interface CanvasPersistence {
  /** Persist a mutation. No-op in static mode. */
  save(action: string, params: Record<string, unknown>): void
  /** If present, watch for external changes and call onChange. Returns cleanup function. */
  watch?(onChange: () => void): () => void
  /** Whether mutation UI (new note, delete, connect, edge relabel) should be shown. */
  allowMutations: boolean
}

export function serverPersistence(documentPath: string, loadDoc: () => void): CanvasPersistence {
  return {
    save(action, params) {
      postAction(action, { path: documentPath, ...params }).catch(loadDoc)
    },
    watch(onChange) {
      const wsUrl = `ws://${location.host}/ws/watch`
      let ws: WebSocket
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null
      function connect() {
        ws = new WebSocket(wsUrl)
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data as string)
            if (data.event === 'changed' && data.path === documentPath) onChange()
          } catch {}
        }
        ws.onclose = () => { reconnectTimer = setTimeout(connect, 2000) }
      }
      connect()
      return () => {
        if (reconnectTimer !== null) clearTimeout(reconnectTimer)
        ws?.close()
      }
    },
    allowMutations: true,
  }
}

export const staticPersistence: CanvasPersistence = {
  save() {},
  allowMutations: false,
}
