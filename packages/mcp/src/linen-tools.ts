import {
  emptyLinenDocument,
  parseLinenDocument,
  serializeLinenDocument,
  addModule,
  addContract,
  addNode,
  setNode,
  removeNode,
  connect,
  disconnect,
  applyLinenBatch,
  checkLinenDocument,
  kindDescriptor,
  traceFrom,
  resumeContract,
  moduleManifest,
} from '@luminous/core/linen'
import type {
  LinenAction,
  LinenDocument,
  LinenResult,
  LinenTraceNode,
  ModuleManifest,
} from '@luminous/core/linen'

const LINEN_DOC_SUFFIX = '.linen.json'

export async function loadLinen(serverUrl: string, path: string): Promise<LinenDocument> {
  const res = await fetch(`${serverUrl}/api/document/${encodeURIComponent(path)}`)
  if (!res.ok) {
    throw new Error(`Failed to read linen document '${path}': HTTP ${res.status}`)
  }
  const text = JSON.stringify(await res.json())
  const parsed = parseLinenDocument(text)
  if (!parsed.ok) {
    throw new Error(`Invalid linen document '${path}': ${parsed.issues.join('; ')}`)
  }
  return parsed.doc
}

export async function writeLinen(serverUrl: string, path: string, doc: LinenDocument): Promise<void> {
  const content = JSON.parse(serializeLinenDocument(doc))
  const res = await fetch(`${serverUrl}/api/document/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  })
  if (!res.ok) {
    throw new Error(`Failed to write linen document '${path}': HTTP ${res.status}`)
  }
}

/** Every write reports the check result alongside — issues never block the
 * write (warnings are vocabulary gaps to keep, errors are for the author to
 * fix), but the author always sees them. */
export interface LinenWriteResult {
  document: LinenDocument
  issues: ReturnType<typeof checkLinenDocument>
}

async function commit(serverUrl: string, path: string, result: LinenResult): Promise<LinenWriteResult> {
  if (!result.ok) {
    throw new Error(result.error)
  }
  await writeLinen(serverUrl, path, result.doc)
  return { document: result.doc, issues: checkLinenDocument(result.doc) }
}

export async function listLinens(serverUrl: string): Promise<{ paths: string[] }> {
  const res = await fetch(`${serverUrl}/api/documents`)
  if (!res.ok) {
    throw new Error(`Failed to list documents: HTTP ${res.status}`)
  }
  const body = (await res.json()) as { documents?: { path: string }[] }
  const paths = (body.documents ?? [])
    .map((d) => d.path)
    .filter((p) => p.endsWith(LINEN_DOC_SUFFIX))
  return { paths }
}

export async function createLinen(serverUrl: string, path: string): Promise<LinenDocument> {
  if (!path.endsWith(LINEN_DOC_SUFFIX)) {
    throw new Error(`path '${path}' must end with '${LINEN_DOC_SUFFIX}'`)
  }
  const doc = emptyLinenDocument()
  await writeLinen(serverUrl, path, doc)
  return doc
}

export async function readLinen(serverUrl: string, path: string): Promise<{ document: LinenDocument; issues: ReturnType<typeof checkLinenDocument> }> {
  const document = await loadLinen(serverUrl, path)
  return { document, issues: checkLinenDocument(document) }
}

export async function getLinenNode(serverUrl: string, path: string, id: string): Promise<LinenTraceNode> {
  const doc = await loadLinen(serverUrl, path)
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) {
    throw new Error(`Trace Node '${id}' not found in linen document '${path}'`)
  }
  return node
}

export async function linenNodeCreate(
  serverUrl: string,
  path: string,
  fields: { id: string; kind: string; module: string; annotation?: string; x?: number; y?: number; to?: string; contract?: string },
): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  return commit(serverUrl, path, addNode(doc, fields))
}

export async function linenNodeSet(
  serverUrl: string,
  path: string,
  id: string,
  patch: { annotation?: string; x?: number; y?: number; to?: string; contract?: string },
): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  // The MCP dispatcher materializes every optional argument as a key whose
  // value is undefined; core's setNode treats a present undefined key as a
  // clear request, so strip the synthetic keys.
  const providedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as typeof patch
  return commit(serverUrl, path, setNode(doc, id, providedPatch))
}

export async function linenNodeDelete(serverUrl: string, path: string, id: string): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  return commit(serverUrl, path, removeNode(doc, id))
}

export async function linenModuleCreate(
  serverUrl: string,
  path: string,
  fields: { id: string; name: string; parent?: string },
): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  return commit(serverUrl, path, addModule(doc, fields))
}

export async function linenContractCreate(
  serverUrl: string,
  path: string,
  fields: { id: string; name: string; owner?: string; text?: string },
): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  return commit(serverUrl, path, addContract(doc, fields))
}

export async function linenConnect(serverUrl: string, path: string, from: string, to: string): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  return commit(serverUrl, path, connect(doc, from, to))
}

export async function linenDisconnect(serverUrl: string, path: string, from: string, to: string): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  return commit(serverUrl, path, disconnect(doc, from, to))
}

export async function linenBatch(serverUrl: string, path: string, actions: LinenAction[]): Promise<LinenWriteResult> {
  const doc = await loadLinen(serverUrl, path)
  return commit(serverUrl, path, applyLinenBatch(doc, actions))
}

export async function linenCheck(serverUrl: string, path: string): Promise<{ issues: ReturnType<typeof checkLinenDocument> }> {
  const doc = await loadLinen(serverUrl, path)
  return { issues: checkLinenDocument(doc) }
}

export interface LinenTraceStep {
  id: string
  kind: string
  term: string
  module: string
  annotation?: string
  /** Present on a Pass: the Module passed to and the derived resume Contract
   * (the return rule) — computed, never stored. */
  to?: string
  resumeContract?: string
}

export async function linenTrace(serverUrl: string, path: string, entry: string): Promise<{ steps: LinenTraceStep[] }> {
  const doc = await loadLinen(serverUrl, path)
  if (!doc.nodes.some((n) => n.id === entry)) {
    throw new Error(`Trace Node '${entry}' not found in linen document '${path}'`)
  }
  const steps = traceFrom(doc, entry).map((node) => {
    const step: LinenTraceStep = {
      id: node.id,
      kind: node.kind,
      term: kindDescriptor(node.kind).term,
      module: node.module,
    }
    if (node.annotation !== undefined) step.annotation = node.annotation
    if (node.kind === 'pass') {
      step.to = node.to
      const resume = resumeContract(doc, node.id)
      if (resume !== undefined) step.resumeContract = resume.id
    }
    return step
  })
  return { steps }
}

export async function linenManifest(serverUrl: string, path: string, module: string): Promise<ModuleManifest> {
  const doc = await loadLinen(serverUrl, path)
  if (!doc.modules.some((m) => m.id === module)) {
    throw new Error(`Module '${module}' not found in linen document '${path}'`)
  }
  return moduleManifest(doc, module)
}
