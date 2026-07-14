import {
  emptyDataflowDocument,
  parseDataflowDocument,
  serializeDataflowDocument,
  addBox,
  setBox,
  connect,
  disconnect,
  removeBox,
  applyDataflowBatch,
  checkDocument,
} from '@luminous/core/dataflow'
import type {
  ContractBlock,
  DataflowAction,
  DataflowDocument,
  CheckIssue,
} from '@luminous/core/dataflow'

export async function loadDataflow(serverUrl: string, path: string): Promise<DataflowDocument> {
  const res = await fetch(`${serverUrl}/api/document/${encodeURIComponent(path)}`)
  if (!res.ok) {
    throw new Error(`Failed to read dataflow document '${path}': HTTP ${res.status}`)
  }
  const text = JSON.stringify(await res.json())
  const parsed = parseDataflowDocument(text)
  if (!parsed.ok) {
    throw new Error(`Invalid dataflow document '${path}': ${parsed.issues.join('; ')}`)
  }
  return parsed.doc
}

export async function writeDataflow(serverUrl: string, path: string, doc: DataflowDocument): Promise<void> {
  const content = JSON.parse(serializeDataflowDocument(doc))
  const res = await fetch(`${serverUrl}/api/document/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
  if (!res.ok) {
    throw new Error(`Failed to write dataflow document '${path}': HTTP ${res.status}`)
  }
}

export async function listDataflows(serverUrl: string): Promise<{ paths: string[] }> {
  const res = await fetch(`${serverUrl}/api/documents`)
  if (!res.ok) {
    throw new Error(`Failed to list documents: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { documents?: { path: string }[] }
  const paths = (body.documents ?? [])
    .map((d) => d.path)
    .filter((p) => p.endsWith('.dataflow.json'))
  return { paths }
}

export async function createDataflow(serverUrl: string, path: string): Promise<DataflowDocument> {
  if (!path.endsWith('.dataflow.json')) {
    throw new Error(`path '${path}' must end with '.dataflow.json'`)
  }
  const doc = emptyDataflowDocument()
  await writeDataflow(serverUrl, path, doc)
  return doc
}

export async function readDataflow(serverUrl: string, path: string): Promise<DataflowDocument> {
  return loadDataflow(serverUrl, path)
}

export async function addBoxTool(
  serverUrl: string,
  path: string,
  fields: { name: string; description?: string; contract?: ContractBlock },
): Promise<{ id: string }> {
  const doc = await loadDataflow(serverUrl, path)
  const result = addBox(doc, fields)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeDataflow(serverUrl, path, result.doc)
  const created = result.doc.boxes[result.doc.boxes.length - 1]
  return { id: created.id }
}

export async function setBoxTool(
  serverUrl: string,
  path: string,
  box: string,
  fields: { name?: string; description?: string; contract?: ContractBlock },
): Promise<DataflowDocument> {
  const doc = await loadDataflow(serverUrl, path)
  const result = setBox(doc, box, fields)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeDataflow(serverUrl, path, result.doc)
  return result.doc
}

export async function connectTool(
  serverUrl: string,
  path: string,
  from: string,
  to: string,
): Promise<DataflowDocument> {
  const doc = await loadDataflow(serverUrl, path)
  const result = connect(doc, from, to)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeDataflow(serverUrl, path, result.doc)
  return result.doc
}

export async function disconnectTool(
  serverUrl: string,
  path: string,
  from: string,
  to: string,
): Promise<DataflowDocument> {
  const doc = await loadDataflow(serverUrl, path)
  const result = disconnect(doc, from, to)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeDataflow(serverUrl, path, result.doc)
  return result.doc
}

export async function removeBoxTool(
  serverUrl: string,
  path: string,
  box: string,
  cascade?: boolean,
): Promise<DataflowDocument> {
  const doc = await loadDataflow(serverUrl, path)
  const result = removeBox(doc, box, { cascade })
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeDataflow(serverUrl, path, result.doc)
  return result.doc
}

export async function checkTool(serverUrl: string, path: string): Promise<{ issues: CheckIssue[] }> {
  const doc = await loadDataflow(serverUrl, path)
  return { issues: checkDocument(doc) }
}

export async function batchTool(
  serverUrl: string,
  path: string,
  actions: DataflowAction[],
): Promise<DataflowDocument> {
  const doc = await loadDataflow(serverUrl, path)
  const result = applyDataflowBatch(doc, actions)
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeDataflow(serverUrl, path, result.doc)
  return result.doc
}
