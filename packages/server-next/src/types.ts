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

/** v2 canvas document — kept for diag.ts compatibility. */
export interface V2Document {
  version: 2
  schemas:   Record<string, Schema>
  structure: Record<string, NodeStructure>
  content:   Record<string, NodeContent>
  edges:     Record<string, Edge>
  legend?:   Legend
}

// ---------------------------------------------------------------------------
// v3 types — canonical on-disk format for new canvases
// ---------------------------------------------------------------------------

export interface V3Node {
  id: string
  kind: string
  props: Record<string, unknown>
  tags: string[]
}

export interface V3Edge {
  id: string
  kind: string
  from: string
  to: string
  props: Record<string, unknown>
  tags: string[]
}

export interface V3Document {
  version: 3
  packs: Record<string, string>
  nodes: V3Node[]
  edges: V3Edge[]
  defaultView?: string
}

export type Document = V3Document
