export interface DocumentMeta {
  path: string
  name: string
  lastModified: number
}

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

export async function listDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch('/api/documents')
  const data = await res.json()
  return data.documents
}

export async function getDocument(path: string): Promise<Document> {
  const res = await fetch(`/api/document/${encodeURIComponent(path)}`)
  return res.json()
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
  return res.json()
}
