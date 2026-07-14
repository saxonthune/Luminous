import { readdir, stat, readFile } from "node:fs/promises"
import { join, relative, basename, resolve, dirname } from "node:path"
import type { DocumentMeta } from "./types.js"

/** A named storage root the server scans for documents. */
export interface WorkspaceRoot {
  /** Grouping key surfaced to the client. */
  name: string
  /** Absolute directory on disk. */
  dir: string
}

/** Directories never worth descending into when scanning a repo root. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "test-results",
  "playwright-report",
  ".turbo",
  ".cache",
])

async function walk(dir: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const results: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      results.push(...(await walk(join(dir, entry.name))))
    } else if (entry.isFile() && entry.name.endsWith(".graph.json")) {
      results.push(join(dir, entry.name))
    }
  }
  return results
}

/**
 * Resolve workspace roots from a gitignored config file:
 *   { "roots": [".", "../RankThePlanet"] }
 * Paths are resolved relative to the config file's directory. Root names are
 * the directory basenames (de-duplicated). Falls back to a single root when
 * no config is present or it is malformed.
 */
export async function resolveRoots(
  configPath: string | null,
  fallbackDir: string
): Promise<WorkspaceRoot[]> {
  if (configPath) {
    try {
      const raw = await readFile(configPath, "utf-8")
      const parsed = JSON.parse(raw) as { roots?: unknown }
      if (Array.isArray(parsed.roots) && parsed.roots.length > 0) {
        const base = dirname(configPath)
        const seen = new Set<string>()
        const roots: WorkspaceRoot[] = []
        for (const entry of parsed.roots) {
          if (typeof entry !== "string") continue
          const dir = resolve(base, entry)
          let name = basename(dir)
          while (seen.has(name)) name = `${name}_`
          seen.add(name)
          roots.push({ name, dir })
        }
        if (roots.length > 0) return roots
      }
      console.error(`[workspace] config has no usable roots: ${configPath}`)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== "ENOENT") {
        console.error(`[workspace] failed to read config ${configPath}:`, err)
      }
    }
  }
  return [{ name: basename(fallbackDir), dir: fallbackDir }]
}

/** Scan every root for *.graph.json files, namespacing paths by root name. */
export async function scanDocuments(roots: WorkspaceRoot[]): Promise<DocumentMeta[]> {
  const metas: DocumentMeta[] = []
  for (const root of roots) {
    const files = await walk(root.dir)
    for (const absPath of files) {
      const s = await stat(absPath)
      const rel = relative(root.dir, absPath).replace(/\\/g, "/")
      metas.push({
        path: `${root.name}/${rel}`,
        name: basename(absPath, ".graph.json"),
        root: root.name,
        rootDir: root.dir,
        lastModified: s.mtimeMs,
      })
    }
  }
  return metas
}
