import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDocument, setRootDir } from '../src/store.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'canvas-create-test-'))
  setRootDir(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('createDocument', () => {
  it('creates a new empty v3 canvas file', async () => {
    const result = await createDocument('test.canvas.json', { primitives: '^0.1.0' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const raw = await readFile(join(tmpDir, 'test.canvas.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(3)
    expect(parsed.packs).toEqual({ primitives: '^0.1.0' })
    expect(parsed.nodes).toEqual([])
    expect(parsed.edges).toEqual([])
  })

  it('returns ok: true with the path', async () => {
    const result = await createDocument('mycanvas.canvas.json')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path).toBe('mycanvas.canvas.json')
  })

  it('creates a canvas with no packs when packs is omitted', async () => {
    const result = await createDocument('empty.canvas.json')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const raw = await readFile(join(tmpDir, 'empty.canvas.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.packs).toEqual({})
  })

  it('fails with ok: false when file already exists', async () => {
    await createDocument('existing.canvas.json')
    const result = await createDocument('existing.canvas.json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('already exists')
  })
})
