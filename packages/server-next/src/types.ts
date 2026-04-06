export interface Note {
  id: string
  title: string
  body: string
  parentId: string | null
  x: number
  y: number
  w: number
  h: number
}

export interface Edge {
  id: string
  fromId: string
  toId: string
  label: string | null
}

export interface Document {
  notes: Record<string, Note>
  edges: Record<string, Edge>
}

export interface DocumentMeta {
  path: string
  name: string
  lastModified: number
}
