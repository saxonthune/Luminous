import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanDocuments } from '../src/workspace.js'
import {
  setRootDir,
  getRawDocument,
  writeRawDocument,
  isAtlasPath,
  applyAction,
  applyBatch,
  readAtlasDataFile,
} from '../src/store.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'atlas-docs-test-'))
  setRootDir(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('isAtlasPath', () => {
  it('matches .atlas.json paths only', () => {
    expect(isAtlasPath('foo.atlas.json')).toBe(true)
    expect(isAtlasPath('foo.graph.json')).toBe(false)
    expect(isAtlasPath('foo.dataflow.json')).toBe(false)
  })
})

describe('scanDocuments', () => {
  it('lists .atlas.json files alongside .graph.json, with suffix stripped from name', async () => {
    await writeFile(join(tmpDir, 'system.atlas.json'), JSON.stringify({ v: 1, nodes: [], edges: [] }))
    await writeFile(join(tmpDir, 'canvas.graph.json'), JSON.stringify({ version: 3, pack: '', nodes: [], edges: [] }))

    const root = { name: 'root', dir: tmpDir }
    const docs = await scanDocuments([root])

    const names = docs.map((d) => d.name).sort()
    expect(names).toEqual(['canvas', 'system'])

    const atlasMeta = docs.find((d) => d.name === 'system')
    expect(atlasMeta?.path).toBe('root/system.atlas.json')
  })

  it('does not list a .atlasdata.json sidecar (R81)', async () => {
    await writeFile(join(tmpDir, 'system.atlas.json'), JSON.stringify({ v: 1, nodes: [], edges: [] }))
    await writeFile(join(tmpDir, 'system.atlasdata.json'), JSON.stringify({ v: 1, entries: {} }))

    const root = { name: 'root', dir: tmpDir }
    const docs = await scanDocuments([root])

    const names = docs.map((d) => d.name).sort()
    expect(names).toEqual(['system'])
  })
})

describe('readAtlasDataFile', () => {
  it('serves an existing sidecar as raw text', async () => {
    const content = { v: 1, entries: { hello: { text: 'world' } } }
    await writeFile(join(tmpDir, 'system.atlasdata.json'), JSON.stringify(content))

    const raw = await readAtlasDataFile('system.atlasdata.json')
    expect(JSON.parse(raw)).toEqual(content)
  })

  it('throws when the sidecar is missing', async () => {
    await expect(readAtlasDataFile('does-not-exist.atlasdata.json')).rejects.toThrow()
  })
})

describe('getRawDocument / writeRawDocument', () => {
  it('round-trips arbitrary JSON through .atlas.json without a v3 gate', async () => {
    const content = { v: 1, nodes: [{ id: 'a', name: 'A' }], edges: [] }
    await writeRawDocument('system.atlas.json', content)

    const raw = await readFile(join(tmpDir, 'system.atlas.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(content)
    expect(raw.endsWith('\n')).toBe(true)

    const loaded = await getRawDocument('system.atlas.json')
    expect(loaded).toEqual(content)
  })

  it('creates a new file at a non-existent path', async () => {
    await writeRawDocument('does-not-exist.atlas.json', { fresh: true })
    const raw = await readFile(join(tmpDir, 'does-not-exist.atlas.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ fresh: true })
  })

  it('updates an existing file in place', async () => {
    await writeRawDocument('system.atlas.json', { v: 1 })
    await writeRawDocument('system.atlas.json', { v: 2 })
    const raw = await readFile(join(tmpDir, 'system.atlas.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ v: 2 })
  })
})

describe('graph actions on atlas paths', () => {
  it('applyAction fails cleanly instead of touching the file', async () => {
    await writeRawDocument('system.atlas.json', { anything: 'goes' })
    const result = await applyAction('system.atlas.json', 'node/add', { kind: 'prim.box' })
    expect(result.ok).toBe(false)

    const raw = await readFile(join(tmpDir, 'system.atlas.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ anything: 'goes' })
  })

  it('applyBatch fails cleanly instead of touching the file', async () => {
    await writeRawDocument('system.atlas.json', { anything: 'goes' })
    const results = await applyBatch('system.atlas.json', [{ action: 'node/add', params: { kind: 'prim.box' } }])
    expect(results.every((r) => r.ok)).toBe(false)

    const raw = await readFile(join(tmpDir, 'system.atlas.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ anything: 'goes' })
  })
})
