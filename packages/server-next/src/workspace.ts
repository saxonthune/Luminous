import { readdir, stat } from "node:fs/promises"
import { join, relative, basename } from "node:path"
import type { DocumentMeta } from "./types.js"

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await walk(full)
      results.push(...nested)
    } else if (entry.isFile() && entry.name.endsWith(".canvas.json")) {
      results.push(full)
    }
  }
  return results
}

export async function scanDocuments(rootDir: string): Promise<DocumentMeta[]> {
  const files = await walk(rootDir)
  const metas: DocumentMeta[] = []
  for (const absPath of files) {
    const s = await stat(absPath)
    const relPath = relative(rootDir, absPath)
    const name = basename(absPath, ".canvas.json")
    metas.push({ path: relPath, name, lastModified: s.mtimeMs })
  }
  return metas
}
