import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanDocuments } from '../src/workspace.js'
import {
  setRootDir,
  getRawDocument,
  writeRawDocument,
  isMerinoPath,
  isRawDocPath,
  applyAction,
} from '../src/store.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'merino-docs-test-'))
  setRootDir(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

const EMPTY = { v: 1, nodeTypes: [], edgeTypes: [], nodes: [], edges: [] }

describe('isMerinoPath', () => {
  it('matches .merino.json paths only', () => {
    expect(isMerinoPath('foo.merino.json')).toBe(true)
    expect(isMerinoPath('foo.linen.json')).toBe(false)
    expect(isMerinoPath('foo.graph.json')).toBe(false)
    expect(isRawDocPath('foo.merino.json')).toBe(true)
  })
})

describe('scanDocuments', () => {
  it('lists .merino.json files with the suffix stripped from name', async () => {
    await writeFile(join(tmpDir, 'design.merino.json'), JSON.stringify(EMPTY))

    const docs = await scanDocuments([{ name: 'root', dir: tmpDir }])
    const meta = docs.find((d) => d.name === 'design')
    expect(meta?.path).toBe('root/design.merino.json')
  })
})

describe('getRawDocument / writeRawDocument', () => {
  it('round-trips JSON through .merino.json', async () => {
    const content = { ...EMPTY, nodeTypes: [{ id: 'event', name: 'Event', color: 'accent-4' }] }
    await writeRawDocument('design.merino.json', content)

    const raw = await readFile(join(tmpDir, 'design.merino.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual(content)

    const loaded = await getRawDocument('design.merino.json')
    expect(loaded).toEqual(content)
  })
})

describe('graph actions on merino paths', () => {
  it('applyAction fails cleanly instead of touching the file', async () => {
    await writeRawDocument('design.merino.json', { anything: 'goes' })
    const result = await applyAction('design.merino.json', 'node/add', { kind: 'prim.box' })
    expect(result.ok).toBe(false)

    const raw = await readFile(join(tmpDir, 'design.merino.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ anything: 'goes' })
  })
})
