import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanDocuments } from '../src/workspace.js'
import {
  setRootDir,
  getRawDocument,
  writeRawDocument,
  isDataflowPath,
  applyAction,
  applyBatch,
} from '../src/store.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'dataflow-docs-test-'))
  setRootDir(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('isDataflowPath', () => {
  it('matches .dataflow.json paths only', () => {
    expect(isDataflowPath('foo.dataflow.json')).toBe(true)
    expect(isDataflowPath('foo.graph.json')).toBe(false)
    expect(isDataflowPath('foo.pack.json')).toBe(false)
  })
})

describe('scanDocuments', () => {
  it('lists .dataflow.json files alongside .graph.json, with suffix stripped from name', async () => {
    await writeFile(join(tmpDir, 'pipeline.dataflow.json'), JSON.stringify({ hello: 'world' }))
    await writeFile(join(tmpDir, 'canvas.graph.json'), JSON.stringify({ version: 3, pack: '', nodes: [], edges: [] }))

    const root = { name: 'root', dir: tmpDir }
    const docs = await scanDocuments([root])

    const names = docs.map((d) => d.name).sort()
    expect(names).toEqual(['canvas', 'pipeline'])

    const dataflowMeta = docs.find((d) => d.name === 'pipeline')
    expect(dataflowMeta?.path).toBe('root/pipeline.dataflow.json')
  })
})

describe('getRawDocument / writeRawDocument', () => {
  it('round-trips arbitrary JSON through .dataflow.json without a v3 gate', async () => {
    const content = { anything: 'goes', nested: { a: 1 } }
    await writeRawDocument('flow.dataflow.json', content)

    const raw = await readFile(join(tmpDir, 'flow.dataflow.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(content)
    expect(raw.endsWith('\n')).toBe(true)

    const loaded = await getRawDocument('flow.dataflow.json')
    expect(loaded).toEqual(content)
  })

  it('creates a new file at a non-existent path', async () => {
    await writeRawDocument('does-not-exist.dataflow.json', { fresh: true })
    const raw = await readFile(join(tmpDir, 'does-not-exist.dataflow.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ fresh: true })
  })

  it('updates an existing file in place', async () => {
    await writeRawDocument('flow.dataflow.json', { v: 1 })
    await writeRawDocument('flow.dataflow.json', { v: 2 })
    const raw = await readFile(join(tmpDir, 'flow.dataflow.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ v: 2 })
  })
})

describe('graph actions on dataflow paths', () => {
  it('applyAction fails cleanly instead of touching the file', async () => {
    await writeRawDocument('flow.dataflow.json', { anything: 'goes' })
    const result = await applyAction('flow.dataflow.json', 'node/add', { kind: 'prim.box' })
    expect(result.ok).toBe(false)

    const raw = await readFile(join(tmpDir, 'flow.dataflow.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ anything: 'goes' })
  })

  it('applyBatch fails cleanly instead of touching the file', async () => {
    await writeRawDocument('flow.dataflow.json', { anything: 'goes' })
    const results = await applyBatch('flow.dataflow.json', [{ action: 'node/add', params: { kind: 'prim.box' } }])
    expect(results.every((r) => r.ok)).toBe(false)

    const raw = await readFile(join(tmpDir, 'flow.dataflow.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ anything: 'goes' })
  })
})
