import { describe, it, expect } from 'vitest'
import { applyActionToDoc } from '../src/actions.js'
import type { Document } from '../src/types.js'

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    version: 3,
    packs: {},
    nodes: [],
    edges: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// node/add
// ---------------------------------------------------------------------------

describe('node/add', () => {
  it('adds a node and returns its id', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/add', { kind: 'prim.box' })
    expect(result.ok).toBe(true)
    expect(result.id).toBeDefined()
    expect(doc.nodes).toHaveLength(1)
    expect(doc.nodes[0].kind).toBe('prim.box')
    expect(doc.nodes[0].props).toEqual({})
    expect(doc.nodes[0].tags).toEqual([])
  })

  it('uses provided id', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'my-id' })
    expect(result.ok).toBe(true)
    expect(result.id).toBe('my-id')
    expect(doc.nodes[0].id).toBe('my-id')
  })

  it('stores props and tags', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', props: { label: 'Hello' }, tags: ['important'] })
    expect(doc.nodes[0].props).toEqual({ label: 'Hello' })
    expect(doc.nodes[0].tags).toEqual(['important'])
  })

  it('fails when kind is missing', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/add', {})
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('kind')
  })
})

// ---------------------------------------------------------------------------
// node/setProps
// ---------------------------------------------------------------------------

describe('node/setProps', () => {
  it('shallow-merges props', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1', props: { a: 1, b: 2 } })
    const result = applyActionToDoc(doc, 'node/setProps', { id: 'n1', props: { b: 99, c: 3 } })
    expect(result.ok).toBe(true)
    expect(doc.nodes[0].props).toEqual({ a: 1, b: 99, c: 3 })
  })

  it('fails when id is missing', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/setProps', { props: {} })
    expect(result.ok).toBe(false)
  })

  it('fails when props is missing', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    const result = applyActionToDoc(doc, 'node/setProps', { id: 'n1' })
    expect(result.ok).toBe(false)
  })

  it('fails when node not found', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/setProps', { id: 'nonexistent', props: {} })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// node/setTags
// ---------------------------------------------------------------------------

describe('node/setTags', () => {
  it('replaces tags', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1', tags: ['old'] })
    const result = applyActionToDoc(doc, 'node/setTags', { id: 'n1', tags: ['new', 'tag'] })
    expect(result.ok).toBe(true)
    expect(doc.nodes[0].tags).toEqual(['new', 'tag'])
  })

  it('fails when id is missing', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/setTags', { tags: [] })
    expect(result.ok).toBe(false)
  })

  it('fails when node not found', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/setTags', { id: 'ghost', tags: [] })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// node/delete
// ---------------------------------------------------------------------------

describe('node/delete', () => {
  it('removes the node', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    const result = applyActionToDoc(doc, 'node/delete', { id: 'n1' })
    expect(result.ok).toBe(true)
    expect(doc.nodes).toHaveLength(0)
  })

  it('cascade-removes edges referencing the node', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1', to: 'n2', id: 'e1' })
    const result = applyActionToDoc(doc, 'node/delete', { id: 'n1' })
    expect(result.ok).toBe(true)
    expect(doc.edges).toHaveLength(0)
  })

  it('fails when id is missing', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/delete', {})
    expect(result.ok).toBe(false)
  })

  it('fails when node not found', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/delete', { id: 'ghost' })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// edge/add
// ---------------------------------------------------------------------------

describe('edge/add', () => {
  it('adds an edge between two nodes', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    const result = applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1', to: 'n2' })
    expect(result.ok).toBe(true)
    expect(result.id).toBeDefined()
    expect(doc.edges).toHaveLength(1)
    expect(doc.edges[0].from).toBe('n1')
    expect(doc.edges[0].to).toBe('n2')
  })

  it('uses provided id', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    const result = applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1', to: 'n2', id: 'e-custom' })
    expect(result.ok).toBe(true)
    expect(result.id).toBe('e-custom')
  })

  it('fails when kind is missing', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    const result = applyActionToDoc(doc, 'edge/add', { from: 'n1', to: 'n2' })
    expect(result.ok).toBe(false)
  })

  it('fails when from is missing', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', to: 'n2' })
    expect(result.ok).toBe(false)
  })

  it('fails when to is missing', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1' })
    expect(result.ok).toBe(false)
  })

  it('fails when from node does not exist', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    const result = applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'ghost', to: 'n2' })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('edge endpoint not found: ghost')
  })

  it('fails when to node does not exist', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    const result = applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1', to: 'ghost' })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('edge endpoint not found: ghost')
  })
})

// ---------------------------------------------------------------------------
// edge/setProps
// ---------------------------------------------------------------------------

describe('edge/setProps', () => {
  it('shallow-merges props', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1', to: 'n2', id: 'e1', props: { x: 1 } })
    const result = applyActionToDoc(doc, 'edge/setProps', { id: 'e1', props: { y: 2 } })
    expect(result.ok).toBe(true)
    expect(doc.edges[0].props).toEqual({ x: 1, y: 2 })
  })

  it('fails when edge not found', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'edge/setProps', { id: 'ghost', props: {} })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// edge/setTags
// ---------------------------------------------------------------------------

describe('edge/setTags', () => {
  it('replaces tags', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1', to: 'n2', id: 'e1', tags: ['old'] })
    const result = applyActionToDoc(doc, 'edge/setTags', { id: 'e1', tags: ['new'] })
    expect(result.ok).toBe(true)
    expect(doc.edges[0].tags).toEqual(['new'])
  })

  it('fails when edge not found', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'edge/setTags', { id: 'ghost', tags: [] })
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// edge/remove
// ---------------------------------------------------------------------------

describe('edge/remove', () => {
  it('removes the edge', () => {
    const doc = makeDoc()
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n1' })
    applyActionToDoc(doc, 'node/add', { kind: 'prim.box', id: 'n2' })
    applyActionToDoc(doc, 'edge/add', { kind: 'prim.arrow', from: 'n1', to: 'n2', id: 'e1' })
    const result = applyActionToDoc(doc, 'edge/remove', { id: 'e1' })
    expect(result.ok).toBe(true)
    expect(doc.edges).toHaveLength(0)
  })

  it('fails when id is missing', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'edge/remove', {})
    expect(result.ok).toBe(false)
  })

  it('fails when edge not found', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'edge/remove', { id: 'ghost' })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// unknown action
// ---------------------------------------------------------------------------

describe('unknown action', () => {
  it('returns error for unknown action', () => {
    const doc = makeDoc()
    const result = applyActionToDoc(doc, 'node/create', {})
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('unknown action')
  })
})
