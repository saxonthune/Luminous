export interface NodeBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  parentId: string | null
  kind?: string           // optional semantic type hint for visual styling
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
  /** v2: optional reference to an edge schema. Forward-looking; safe to ignore. */
  schemaName?: string
}

export interface Document {
  notes: Record<string, Node>
  edges: Record<string, Edge>
}

export interface DocumentMeta {
  path: string
  name: string
  lastModified: number
}

// ===========================================================================
// v2 — schema-driven node data model
// New types are additive; existing types above remain in use until the H+M
// cleanup task switches everything over and removes them.
// See: .carta/01-luminous/03-research-sessions/04-node-data-architecture.md
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
export interface DocumentV2 {
  version: 2
  schemas:   Record<string, Schema>
  structure: Record<string, NodeStructure>
  content:   Record<string, NodeContent>
  edges:     Record<string, Edge>
}
