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
