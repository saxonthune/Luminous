import { describe, it, expect, beforeEach } from 'vitest'
import { roots, bbox, outliers, subtree } from '../src/diag.js'
import type { Document } from '../src/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    version: 2,
    schemas: {},
    structure: {},
    content: {},
    edges: {},
    ...overrides,
  }
}

let _idCounter = 0
function nextId(): string {
  return `node-${++_idCounter}`
}

beforeEach(() => { _idCounter = 0 })

// ---------------------------------------------------------------------------
// Test 1: roots returns per-category summary
// ---------------------------------------------------------------------------

describe('roots', () => {
  it('returns per-category summary for a synthetic doc', () => {
    const comp1 = nextId()
    const comp2 = nextId()
    const hook1 = nextId()
    const sig1 = nextId()
    const child1 = nextId()

    const doc = makeDoc({
      structure: {
        [comp1]: { id: comp1, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 200, h: 300 } },
        [comp2]: { id: comp2, schemaName: 'component', parent: null, order: 'a1', geometry: { x: 300, y: 0, w: 200, h: 500 } },
        [hook1]: { id: hook1, schemaName: 'hook', parent: null, order: 'b0', geometry: { x: 0, y: 400, w: 150, h: 100 } },
        [sig1]:  { id: sig1,  schemaName: 'signal', parent: null, order: 'c0', geometry: { x: 0, y: 600, w: 100, h: 80 } },
        // non-root child (should not appear in root counts)
        [child1]: { id: child1, schemaName: 'component', parent: comp1, order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 50 } },
      },
    })

    const result = roots(doc)

    expect(result.totalNodes).toBe(5)
    expect(result.rootCount).toBe(4)

    // component category: 2 roots
    expect(result.byCategory['component'].count).toBe(2)
    expect(result.byCategory['component'].tallestId).toBe(comp2)   // comp2 has h=500
    expect(result.byCategory['component'].tallestH).toBe(500)
    expect(result.byCategory['component'].maxH).toBe(500)
    expect(result.byCategory['component'].maxW).toBe(200)

    // hook: 1 root
    expect(result.byCategory['hook'].count).toBe(1)
    expect(result.byCategory['hook'].tallestId).toBe(hook1)

    // signal: 1 root
    expect(result.byCategory['signal'].count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Test 2: bbox.containerHealth catches inflated containers
// ---------------------------------------------------------------------------

describe('bbox', () => {
  it('reports descendants-undersized for an inflated container', () => {
    const parentId = nextId()
    const childId = nextId()

    const doc = makeDoc({
      structure: {
        [parentId]: { id: parentId, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 1000, h: 5000 } },
        [childId]:  { id: childId,  schemaName: 'component', parent: parentId, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
      },
    })

    const result = bbox(doc, parentId)
    expect(result).not.toBeNull()
    expect(result!.containerHealth).toBe('descendants-undersized')
    expect(result!.descendantCount).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // Test 3: bbox.containerHealth catches overflowing children
  // ---------------------------------------------------------------------------

  it('reports descendants-overflow when child extends past parent boundary', () => {
    const parentId = nextId()
    const childId = nextId()

    const doc = makeDoc({
      structure: {
        [parentId]: { id: parentId, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
        [childId]:  { id: childId,  schemaName: 'component', parent: parentId, order: 'a0', geometry: { x: 0, y: 0, w: 500, h: 500 } },
      },
    })

    const result = bbox(doc, parentId)
    expect(result).not.toBeNull()
    expect(result!.containerHealth).toBe('descendants-overflow')
  })

  it('returns null for unknown node id', () => {
    const doc = makeDoc()
    expect(bbox(doc, 'nonexistent')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Test 4: outliers flags h-too-large
// ---------------------------------------------------------------------------

describe('outliers', () => {
  it('flags h-too-large for a node with h=10000', () => {
    const bigId = nextId()
    const normalId = nextId()

    const doc = makeDoc({
      structure: {
        [bigId]:    { id: bigId,    schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 200, h: 10000 } },
        [normalId]: { id: normalId, schemaName: 'component', parent: null, order: 'a1', geometry: { x: 0, y: 0, w: 200, h: 200 } },
      },
    })

    const result = outliers(doc)
    expect(result.totalChecked).toBe(2)
    const entry = result.outliers.find(o => o.id === bigId)
    expect(entry).toBeDefined()
    expect(entry!.flags).toContain('h-too-large')

    // normal node should not be flagged
    expect(result.outliers.find(o => o.id === normalId)).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Test 5: outliers flags overflow-parent
  // ---------------------------------------------------------------------------

  it('flags overflow-parent when child extends past parent', () => {
    const parentId = nextId()
    const childId = nextId()

    // child y + h = 0 + 200 = 200, parent h = 100; 200 > 100 + 10 → overflow
    const doc = makeDoc({
      structure: {
        [parentId]: { id: parentId, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 300, h: 100 } },
        [childId]:  { id: childId,  schemaName: 'component', parent: parentId, order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 200 } },
      },
    })

    const result = outliers(doc)
    const entry = result.outliers.find(o => o.id === childId)
    expect(entry).toBeDefined()
    expect(entry!.flags).toContain('overflow-parent')
  })
})

// ---------------------------------------------------------------------------
// Test 6: subtree returns BFS-ordered nodes with correct depth
// ---------------------------------------------------------------------------

describe('subtree', () => {
  it('returns BFS-ordered nodes with correct depth for a 3-level tree', () => {
    const rootId  = nextId()
    const child1  = nextId()
    const child2  = nextId()
    const grand1  = nextId()
    const grand2  = nextId()

    const doc = makeDoc({
      structure: {
        [rootId]: { id: rootId, schemaName: 'component', parent: null,   order: 'a0', geometry: { x: 0, y: 0, w: 500, h: 500 } },
        [child1]: { id: child1, schemaName: 'component', parent: rootId, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
        [child2]: { id: child2, schemaName: 'component', parent: rootId, order: 'a1', geometry: { x: 0, y: 100, w: 100, h: 100 } },
        [grand1]: { id: grand1, schemaName: 'signal',    parent: child1, order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 50 } },
        [grand2]: { id: grand2, schemaName: 'signal',    parent: child2, order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 50 } },
      },
    })

    const result = subtree(doc, rootId)
    expect(result).not.toBeNull()
    expect(result!.rootId).toBe(rootId)
    expect(result!.nodes).toHaveLength(5)

    const byId = Object.fromEntries(result!.nodes.map(n => [n.id, n]))

    expect(byId[rootId].depth).toBe(0)
    expect(byId[child1].depth).toBe(1)
    expect(byId[child2].depth).toBe(1)
    expect(byId[grand1].depth).toBe(2)
    expect(byId[grand2].depth).toBe(2)

    // Should not be truncated
    expect(result!.truncated).toBeUndefined()
  })

  it('returns null for unknown node id', () => {
    const doc = makeDoc()
    expect(subtree(doc, 'nonexistent')).toBeNull()
  })
})
