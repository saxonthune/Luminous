import { describe, it, expect, beforeEach } from 'vitest'
import { roots, bbox, outliers, subtree, outline, summary, query } from '../src/diag.js'
import type { V2Document } from '../src/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(overrides: Partial<V2Document> = {}): V2Document {
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

// ---------------------------------------------------------------------------
// outline
// ---------------------------------------------------------------------------

describe('outline', () => {
  it('walks all roots when rootId is null — returns forest', () => {
    const r1 = nextId()
    const r2 = nextId()
    const child = nextId()

    const doc = makeDoc({
      schemas: {
        component: { name: 'component', label: 'Component', primitives: [] },
      },
      structure: {
        [r1]:    { id: r1,    schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
        [r2]:    { id: r2,    schemaName: 'component', parent: null, order: 'a1', geometry: { x: 200, y: 0, w: 100, h: 100 } },
        [child]: { id: child, schemaName: 'component', parent: r1,  order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 50 } },
      },
    })

    const result = outline(doc, null)
    expect(result.rootId).toBeNull()
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[0].id).toBe(r1)
    expect(result.nodes[0].children).toHaveLength(1)
    expect(result.nodes[0].children[0].id).toBe(child)
    expect(result.nodes[1].id).toBe(r2)
    expect(result.truncated).toBeUndefined()
  })

  it('walks a single subtree when rootId is a node id', () => {
    const rootId = nextId()
    const child1 = nextId()
    const child2 = nextId()
    const grand1 = nextId()

    const doc = makeDoc({
      schemas: {
        component: { name: 'component', label: 'Component', primitives: [] },
      },
      structure: {
        [rootId]: { id: rootId, schemaName: 'component', parent: null,   order: 'a0', geometry: { x: 0, y: 0, w: 500, h: 500 } },
        [child1]: { id: child1, schemaName: 'component', parent: rootId, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
        [child2]: { id: child2, schemaName: 'component', parent: rootId, order: 'a1', geometry: { x: 0, y: 100, w: 100, h: 100 } },
        [grand1]: { id: grand1, schemaName: 'component', parent: child1, order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 50 } },
      },
    })

    const result = outline(doc, rootId)
    expect(result.rootId).toBe(rootId)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe(rootId)
    expect(result.nodes[0].depth).toBe(0)
    expect(result.nodes[0].children).toHaveLength(2)
    expect(result.nodes[0].children[0].children[0].id).toBe(grand1)
    expect(result.nodes[0].children[0].children[0].depth).toBe(2)
  })

  it('resolves title from schema and content', () => {
    const nodeId = nextId()

    const doc = makeDoc({
      schemas: {
        note: { name: 'note', label: 'Note', primitives: [{ type: 'title', bind: 'title' }] },
      },
      structure: {
        [nodeId]: { id: nodeId, schemaName: 'note', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 200, h: 100 } },
      },
      content: {
        [nodeId]: { title: 'Hello World' },
      },
    })

    const result = outline(doc, null)
    expect(result.nodes[0].title).toBe('Hello World')
  })

  it('returns null title when schema has no title primitive', () => {
    const nodeId = nextId()

    const doc = makeDoc({
      schemas: {
        component: { name: 'component', label: 'Component', primitives: [{ type: 'drag-bar' }] },
      },
      structure: {
        [nodeId]: { id: nodeId, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
      },
    })

    const result = outline(doc, null)
    expect(result.nodes[0].title).toBeNull()
  })

  it('returns null title when content is missing the bound field', () => {
    const nodeId = nextId()

    const doc = makeDoc({
      schemas: {
        note: { name: 'note', label: 'Note', primitives: [{ type: 'title', bind: 'title' }] },
      },
      structure: {
        [nodeId]: { id: nodeId, schemaName: 'note', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
      },
      // no content entry for nodeId
    })

    const result = outline(doc, null)
    expect(result.nodes[0].title).toBeNull()
  })

  it('returns empty nodes when rootId references a missing node', () => {
    const doc = makeDoc()
    const result = outline(doc, 'nonexistent')
    expect(result.nodes).toHaveLength(0)
    expect(result.truncated).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

describe('summary', () => {
  it('totalNodes counts all nodes including nested', () => {
    const r1 = nextId()
    const child = nextId()
    const grand = nextId()

    const doc = makeDoc({
      structure: {
        [r1]:    { id: r1,    schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 400, h: 400 } },
        [child]: { id: child, schemaName: 'signal',    parent: r1,   order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
        [grand]: { id: grand, schemaName: 'hook',      parent: child, order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 50 } },
      },
    })

    const result = summary(doc)
    expect(result.totalNodes).toBe(3)
    expect(result.rootCount).toBe(1)
  })

  it('schemaCounts counts ALL nodes by schemaName, not just roots', () => {
    const r1 = nextId()
    const child1 = nextId()
    const child2 = nextId()

    const doc = makeDoc({
      structure: {
        [r1]:     { id: r1,     schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 400, h: 400 } },
        [child1]: { id: child1, schemaName: 'signal',    parent: r1,   order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
        [child2]: { id: child2, schemaName: 'signal',    parent: r1,   order: 'a1', geometry: { x: 0, y: 100, w: 100, h: 100 } },
      },
    })

    const result = summary(doc)
    expect(result.schemaCounts['component']).toBe(1)
    expect(result.schemaCounts['signal']).toBe(2)
  })

  it('edgeCount reflects doc.edges size', () => {
    const doc = makeDoc({
      edges: {
        'e1': { id: 'e1', fromId: 'a', toId: 'b', label: null },
        'e2': { id: 'e2', fromId: 'b', toId: 'c', label: null },
      },
    })

    const result = summary(doc)
    expect(result.edgeCount).toBe(2)
  })

  it('maxDepth is 0 for a flat doc with only roots', () => {
    const r1 = nextId()
    const r2 = nextId()

    const doc = makeDoc({
      structure: {
        [r1]: { id: r1, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
        [r2]: { id: r2, schemaName: 'component', parent: null, order: 'a1', geometry: { x: 200, y: 0, w: 100, h: 100 } },
      },
    })

    expect(summary(doc).maxDepth).toBe(0)
  })

  it('maxDepth is 2 for a 3-level tree', () => {
    const r = nextId()
    const c = nextId()
    const g = nextId()

    const doc = makeDoc({
      structure: {
        [r]: { id: r, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 500, h: 500 } },
        [c]: { id: c, schemaName: 'component', parent: r,    order: 'a0', geometry: { x: 0, y: 0, w: 200, h: 200 } },
        [g]: { id: g, schemaName: 'signal',    parent: c,    order: 'a0', geometry: { x: 0, y: 0, w: 100, h: 100 } },
      },
    })

    expect(summary(doc).maxDepth).toBe(2)
  })

  it('bbox is null for a doc with no roots', () => {
    const doc = makeDoc()
    expect(summary(doc).bbox).toBeNull()
  })

  it('bbox spans the root-level nodes', () => {
    const r1 = nextId()
    const r2 = nextId()

    const doc = makeDoc({
      structure: {
        [r1]: { id: r1, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0,   y: 0,  w: 100, h: 100 } },
        [r2]: { id: r2, schemaName: 'component', parent: null, order: 'a1', geometry: { x: 200, y: 50, w: 100, h: 100 } },
      },
    })

    const result = summary(doc)
    expect(result.bbox).not.toBeNull()
    expect(result.bbox!.minX).toBe(0)
    expect(result.bbox!.minY).toBe(0)
    expect(result.bbox!.maxX).toBe(300) // 200 + 100
    expect(result.bbox!.maxY).toBe(150) // 50 + 100
  })
})

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

describe('query', () => {
  function makeQueryDoc() {
    const r1 = nextId()
    const r2 = nextId()
    const c1 = nextId()
    const c2 = nextId()

    const doc = makeDoc({
      schemas: {
        component: { name: 'component', label: 'Component', primitives: [{ type: 'title', bind: 'title' }] },
        signal:    { name: 'signal',    label: 'Signal',    primitives: [{ type: 'title', bind: 'title' }] },
      },
      structure: {
        [r1]: { id: r1, schemaName: 'component', parent: null, order: 'a0', geometry: { x: 0, y: 0, w: 200, h: 200 } },
        [r2]: { id: r2, schemaName: 'component', parent: null, order: 'a1', geometry: { x: 300, y: 0, w: 200, h: 200 } },
        [c1]: { id: c1, schemaName: 'signal',    parent: r1,   order: 'a0', geometry: { x: 0, y: 0, w: 50, h: 50 } },
        [c2]: { id: c2, schemaName: 'signal',    parent: r1,   order: 'a1', geometry: { x: 0, y: 60, w: 50, h: 50 } },
      },
      content: {
        [r1]: { title: 'Root One' },
        [r2]: { title: 'Root Two' },
        [c1]: { title: 'Signal A' },
        [c2]: { title: 'Signal B' },
      },
    })
    return { doc, r1, r2, c1, c2 }
  }

  it('filter by type returns only nodes with that schemaName', () => {
    const { doc } = makeQueryDoc()
    const result = query(doc, { type: 'signal' })
    expect(result.nodes.every(n => n.schemaName === 'signal')).toBe(true)
    expect(result.nodes).toHaveLength(2)
  })

  it('filter by parent: null returns only roots', () => {
    const { doc, r1, r2 } = makeQueryDoc()
    const result = query(doc, { parent: null })
    const ids = result.nodes.map(n => n.id)
    expect(ids).toContain(r1)
    expect(ids).toContain(r2)
    expect(result.nodes).toHaveLength(2)
  })

  it('filter by parent: <id> returns only direct children', () => {
    const { doc, r1, c1, c2 } = makeQueryDoc()
    const result = query(doc, { parent: r1 })
    const ids = result.nodes.map(n => n.id)
    expect(ids).toContain(c1)
    expect(ids).toContain(c2)
    expect(result.nodes).toHaveLength(2)
  })

  it('filter by ids returns only those ids', () => {
    const { doc, r1, c1 } = makeQueryDoc()
    const result = query(doc, { ids: [r1, c1] })
    expect(result.nodes).toHaveLength(2)
    const ids = result.nodes.map(n => n.id)
    expect(ids).toContain(r1)
    expect(ids).toContain(c1)
  })

  it('fields: [title, geometry] projects only those fields plus id', () => {
    const { doc } = makeQueryDoc()
    const result = query(doc, { type: 'component' }, ['title', 'geometry'])
    for (const node of result.nodes) {
      expect(node.id).toBeDefined()
      expect(node.title).toBeDefined()
      expect(node.geometry).toBeDefined()
      expect(node.schemaName).toBeUndefined()
      expect(node.parent).toBeUndefined()
    }
  })

  it('default fields (no fields arg) projects id, title, schemaName', () => {
    const { doc } = makeQueryDoc()
    const result = query(doc, { type: 'component' })
    for (const node of result.nodes) {
      expect(node.id).toBeDefined()
      expect(node.title).toBeDefined()
      expect(node.schemaName).toBeDefined()
      expect(node.geometry).toBeUndefined()
      expect(node.parent).toBeUndefined()
    }
  })

  it('totalMatched reflects the full count before any truncation', () => {
    const { doc } = makeQueryDoc()
    const result = query(doc, {})
    expect(result.totalMatched).toBe(4)
    expect(result.truncated).toBeUndefined()
  })

  it('filter by root: true returns only root nodes', () => {
    const { doc, r1, r2 } = makeQueryDoc()
    const result = query(doc, { root: true })
    expect(result.nodes).toHaveLength(2)
    const ids = result.nodes.map(n => n.id)
    expect(ids).toContain(r1)
    expect(ids).toContain(r2)
  })
})
