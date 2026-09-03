import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanDocuments } from '../src/workspace.js'
import {
  setRootDir,
  getRawDocument,
  writeRawDocument,
  isLinenPath,
  isRawDocPath,
  applyAction,
} from '../src/store.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'linen-docs-test-'))
  setRootDir(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('isLinenPath', () => {
  it('matches .linen.json paths only', () => {
    expect(isLinenPath('foo.linen.json')).toBe(true)
    expect(isLinenPath('foo.atlas.json')).toBe(false)
    expect(isLinenPath('foo.graph.json')).toBe(false)
    expect(isRawDocPath('foo.linen.json')).toBe(true)
  })
})

describe('scanDocuments', () => {
  it('lists .linen.json files with the suffix stripped from name', async () => {
    await writeFile(join(tmpDir, 'system.linen.json'), JSON.stringify({ v: 1, modules: [], contracts: [], nodes: [], edges: [] }))

    const docs = await scanDocuments([{ name: 'root', dir: tmpDir }])
    const meta = docs.find((d) => d.name === 'system')
    expect(meta?.path).toBe('root/system.linen.json')
  })
})

describe('getRawDocument / writeRawDocument', () => {
  it('round-trips JSON through .linen.json', async () => {
    const content = { v: 1, modules: [{ id: 'm', name: 'M' }], contracts: [], nodes: [], edges: [] }
    await writeRawDocument('system.linen.json', content)

    const raw = await readFile(join(tmpDir, 'system.linen.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(content)

    const loaded = await getRawDocument('system.linen.json')
    expect(loaded).toEqual(content)
  })
})

describe('graph actions on linen paths', () => {
  it('applyAction fails cleanly instead of touching the file', async () => {
    await writeRawDocument('system.linen.json', { anything: 'goes' })
    const result = await applyAction('system.linen.json', 'node/add', { kind: 'prim.box' })
    expect(result.ok).toBe(false)

    const raw = await readFile(join(tmpDir, 'system.linen.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ anything: 'goes' })
  })
})
