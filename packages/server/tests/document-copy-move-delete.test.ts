import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setRootDir, copyDocument, moveDocument, deleteDocument } from '../src/store.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'document-copy-move-delete-test-'))
  setRootDir(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('copyDocument', () => {
  it('creates the target and leaves the source in place', async () => {
    await writeFile(join(tmpDir, 'source.dataflow.json'), JSON.stringify({ a: 1 }))
    const result = await copyDocument('source.dataflow.json', 'target.dataflow.json')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path).toBe('target.dataflow.json')

    const sourceRaw = await readFile(join(tmpDir, 'source.dataflow.json'), 'utf-8')
    const targetRaw = await readFile(join(tmpDir, 'target.dataflow.json'), 'utf-8')
    expect(JSON.parse(sourceRaw)).toEqual({ a: 1 })
    expect(JSON.parse(targetRaw)).toEqual({ a: 1 })
  })

  it('fails without clobbering when the target already exists', async () => {
    await writeFile(join(tmpDir, 'source.dataflow.json'), JSON.stringify({ a: 1 }))
    await writeFile(join(tmpDir, 'target.dataflow.json'), JSON.stringify({ b: 2 }))
    const result = await copyDocument('source.dataflow.json', 'target.dataflow.json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('target exists')

    const targetRaw = await readFile(join(tmpDir, 'target.dataflow.json'), 'utf-8')
    expect(JSON.parse(targetRaw)).toEqual({ b: 2 })
  })

  it('fails cleanly when the source is missing', async () => {
    const result = await copyDocument('missing.dataflow.json', 'target.dataflow.json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('source not found')
  })
})

describe('moveDocument', () => {
  it('creates the target and removes the source', async () => {
    await writeFile(join(tmpDir, 'source.dataflow.json'), JSON.stringify({ a: 1 }))
    const result = await moveDocument('source.dataflow.json', 'target.dataflow.json')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path).toBe('target.dataflow.json')

    const targetRaw = await readFile(join(tmpDir, 'target.dataflow.json'), 'utf-8')
    expect(JSON.parse(targetRaw)).toEqual({ a: 1 })
    await expect(readFile(join(tmpDir, 'source.dataflow.json'), 'utf-8')).rejects.toThrow()
  })

  it('fails without clobbering when the target already exists', async () => {
    await writeFile(join(tmpDir, 'source.dataflow.json'), JSON.stringify({ a: 1 }))
    await writeFile(join(tmpDir, 'target.dataflow.json'), JSON.stringify({ b: 2 }))
    const result = await moveDocument('source.dataflow.json', 'target.dataflow.json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('target exists')

    const sourceRaw = await readFile(join(tmpDir, 'source.dataflow.json'), 'utf-8')
    const targetRaw = await readFile(join(tmpDir, 'target.dataflow.json'), 'utf-8')
    expect(JSON.parse(sourceRaw)).toEqual({ a: 1 })
    expect(JSON.parse(targetRaw)).toEqual({ b: 2 })
  })

  it('fails cleanly when the source is missing', async () => {
    const result = await moveDocument('missing.dataflow.json', 'target.dataflow.json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('source not found')
  })
})

describe('deleteDocument', () => {
  it('removes the file', async () => {
    await writeFile(join(tmpDir, 'doomed.dataflow.json'), JSON.stringify({ a: 1 }))
    const result = await deleteDocument('doomed.dataflow.json')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path).toBe('doomed.dataflow.json')

    await expect(readFile(join(tmpDir, 'doomed.dataflow.json'), 'utf-8')).rejects.toThrow()
  })

  it('fails cleanly when the file is missing', async () => {
    const result = await deleteDocument('missing.dataflow.json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('not found')
  })
})
