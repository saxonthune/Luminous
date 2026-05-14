import { watch } from "node:fs"
import { readFile, writeFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import type { Document } from "./types.js"
import { applyActionToDoc } from "./actions.js"

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

const cache = new Map<string, Document>()
const dirty = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const recentWrites = new Map<string, number>()

let rootDir = process.cwd()

export function setRootDir(dir: string): void {
  rootDir = dir
}

function emptyDoc(packs: Record<string, string> = {}): Document {
  return { version: 3, packs, nodes: [], edges: [] }
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
        const absPath = resolve(rootDir, relativePath)
        await saveDocument(absPath, doc)
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
      const absPath = resolve(rootDir, relativePath)
      writes.push(saveDocument(absPath, doc))
    }
  }
  await Promise.all(writes)
  dirty.clear()
}

export async function getDocument(relativePath: string): Promise<Document> {
  if (cache.has(relativePath)) {
    return cache.get(relativePath)!
  }
  const absPath = resolve(rootDir, relativePath)
  const doc = await loadDocument(absPath)
  cache.set(relativePath, doc)
  return doc
}

export async function createDocument(
  relativePath: string,
  packs: Record<string, string> = {}
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!relativePath) return { ok: false, error: "missing path" }
  const absPath = resolve(rootDir, relativePath)
  try {
    await access(absPath)
    return { ok: false, error: "already exists" }
  } catch {
    // file does not exist — proceed
  }
  const doc = emptyDoc(packs)
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

export function watchDocuments(
  watchRootDir: string,
  onChange: (relativePath: string) => void
): void {
  watch(watchRootDir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    const normalized = filename.replace(/\\/g, "/")
    if (!normalized.endsWith(".canvas.json")) return
    const absPath = resolve(watchRootDir, normalized)
    const lastWrite = recentWrites.get(absPath)
    if (lastWrite !== undefined && Date.now() - lastWrite < 3000) {
      return
    }
    recentWrites.delete(absPath)
    cache.delete(normalized)
    onChange(normalized)
  })
}
