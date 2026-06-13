import { watch } from "node:fs"
import { readFile, writeFile, access, stat } from "node:fs/promises"
import { resolve } from "node:path"
import type { Document } from "./types.js"
import { applyActionToDoc } from "./actions.js"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

const cache = new Map<string, Document>()
const dirty = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const recentWrites = new Map<string, number>()

/** Workspace roots keyed by name. Document paths are namespaced "<root>/<rel>". */
let roots = new Map<string, string>()

export function setRoots(list: { name: string; dir: string }[]): void {
  roots = new Map(list.map((r) => [r.name, r.dir]))
}

/** Back-compat shim — register a single anonymous root. */
export function setRootDir(dir: string): void {
  roots = new Map([["", dir]])
}

/**
 * Resolve a namespaced document path ("<root>/<rel>") to an absolute file path.
 * If the first segment names a known root, the rest is resolved within it;
 * otherwise the whole path is resolved against the first registered root.
 */
function resolveDocPath(relativePath: string): string {
  const slash = relativePath.indexOf("/")
  if (slash !== -1) {
    const dir = roots.get(relativePath.slice(0, slash))
    if (dir) return resolve(dir, relativePath.slice(slash + 1))
  }
  const first = roots.values().next().value ?? process.cwd()
  return resolve(first, relativePath)
}

function emptyDoc(pack: string = ''): Document {
  return { version: 3, pack, nodes: [], edges: [] }
}

async function loadDocument(filePath: string): Promise<Document> {
  try {
    const raw = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.version === 3) {
      return parsed as Document
    }
    console.error(`[store] document is not version 3: ${filePath}`)
    return emptyDoc()
  } catch (err) {
    console.error(`[store] failed to load document: ${filePath}`, err)
    return emptyDoc()
  }
}

async function saveDocument(filePath: string, doc: Document): Promise<void> {
  await writeFile(filePath, JSON.stringify(doc, null, 2), "utf-8")
  recentWrites.set(filePath, Date.now())
}

function scheduleSave(relativePath: string): void {
  const existing = timers.get(relativePath)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(async () => {
    timers.delete(relativePath)
    if (dirty.has(relativePath)) {
      const doc = cache.get(relativePath)
      if (doc) {
        await saveDocument(resolveDocPath(relativePath), doc)
        dirty.delete(relativePath)
      }
    }
  }, 2000)
  timers.set(relativePath, timer)
}

export async function flushAll(): Promise<void> {
  for (const [relativePath, timer] of timers) {
    clearTimeout(timer)
    timers.delete(relativePath)
  }
  const writes: Promise<void>[] = []
  for (const relativePath of dirty) {
    const doc = cache.get(relativePath)
    if (doc) {
      writes.push(saveDocument(resolveDocPath(relativePath), doc))
    }
  }
  await Promise.all(writes)
  dirty.clear()
}

export async function getDocument(relativePath: string): Promise<Document> {
  if (cache.has(relativePath)) {
    return cache.get(relativePath)!
  }
  const doc = await loadDocument(resolveDocPath(relativePath))
  cache.set(relativePath, doc)
  return doc
}

export async function createDocument(
  relativePath: string,
  pack: string = ''
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!relativePath) return { ok: false, error: "missing path" }
  const absPath = resolveDocPath(relativePath)
  try {
    await access(absPath)
    return { ok: false, error: "already exists" }
  } catch {
    // file does not exist — proceed
  }
  const doc = emptyDoc(pack)
  await saveDocument(absPath, doc)
  cache.set(relativePath, doc)
  return { ok: true, path: relativePath }
}

export async function applyAction(
  relativePath: string,
  action: string,
  params: Record<string, unknown>
): Promise<ActionResult> {
  const doc = await getDocument(relativePath)
  const result = applyActionToDoc(doc, action, params)
  if (result.ok) {
    dirty.add(relativePath)
    scheduleSave(relativePath)
  }
  return result
}

export async function applyBatch(
  relativePath: string,
  actions: Array<{ action: string; params: Record<string, unknown>; ref?: string }>
): Promise<Array<ActionResult & { ref?: string }>> {
  const doc = await getDocument(relativePath)
  const refs = new Map<string, string>()
  const results: Array<ActionResult & { ref?: string }> = []

  for (const entry of actions) {
    const resolvedParams: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(entry.params)) {
      if (typeof value === "string") {
        const refMatch = value.match(/^\$ref:(.+)$/)
        if (refMatch) {
          const refName = refMatch[1]
          const resolved = refs.get(refName)
          if (resolved === undefined) {
            const failResult: ActionResult & { ref?: string } = {
              ok: false,
              error: `unresolved ref: ${refName}`,
            }
            results.push(failResult)
            return results
          }
          resolvedParams[key] = resolved
          continue
        }
      }
      resolvedParams[key] = value
    }

    const result = applyActionToDoc(doc, entry.action, resolvedParams)
    if (!result.ok) {
      results.push(entry.ref ? { ...result, ref: entry.ref } : result)
      return results
    }

    if (entry.ref && result.id !== undefined) {
      refs.set(entry.ref, result.id)
    }

    results.push(entry.ref ? { ...result, ref: entry.ref } : result)
  }

  dirty.add(relativePath)
  scheduleSave(relativePath)

  return results
}

/**
 * Read a pack file (*.pack.json) as raw text. Throws if the file does not exist.
 * Path is resolved through the same root-namespace logic as documents.
 */
export async function readPackFile(relativePath: string): Promise<string> {
  const absPath = resolveDocPath(relativePath)
  await stat(absPath) // throws ENOENT if missing
  return readFile(absPath, "utf-8")
}

export function watchDocuments(
  watchRoots: { name: string; dir: string }[],
  onChange: (relativePath: string) => void
): void {
  for (const root of watchRoots) {
    try {
      const watcher = watch(root.dir, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const normalized = filename.toString().replace(/\\/g, "/")
        if (!normalized.endsWith(".graph.json")) return
        const docPath = root.name ? `${root.name}/${normalized}` : normalized
        const absPath = resolve(root.dir, normalized)
        const lastWrite = recentWrites.get(absPath)
        if (lastWrite !== undefined && Date.now() - lastWrite < 3000) {
          return
        }
        recentWrites.delete(absPath)
        cache.delete(docPath)
        onChange(docPath)
      })
      // Recursive watch on a large repo can exhaust inotify watches; degrade
      // gracefully (live-reload off for this root) rather than crash.
      watcher.on("error", (err) => {
        console.error(`[watch] disabled for ${root.name}:`, err)
        watcher.close()
      })
    } catch (err) {
      console.error(`[watch] could not watch ${root.name}:`, err)
    }
  }
}
