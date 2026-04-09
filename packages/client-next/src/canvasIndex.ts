import { createStore, produce } from 'solid-js/store'
import type {
  Document,
  NodeStructure,
  NodeContent,
  Schema,
  Geometry,
} from './api'

export interface Warning {
  kind: 'missing-schema' | 'cycle' | 'dark-matter-field' | 'unknown-primitive'
  nodeId?: string
  schemaName?: string
  field?: string
  message: string
}

export interface CanvasIndex {
  // Source of truth (reactive accessor)
  doc: () => Document

  // Derived indices (NOT reactive — read-only snapshots, kept in sync on writes)
  // Root nodes are stored under the sentinel key '__root__'
  parentToChildren: Map<string, string[]>
  schemaForNode: Map<string, Schema>
  contentForNode: Map<string, NodeContent>

  // Lookups
  getNode: (id: string) => NodeStructure | undefined
  getContent: (id: string) => NodeContent | undefined
  getSchema: (id: string) => Schema | undefined
  getChildren: (id: string | null) => string[]

  // Mutators (update both source store and indices)
  createNode: (structure: NodeStructure, content: NodeContent) => void
  deleteNode: (id: string) => void
  setContent: (id: string, patch: Partial<NodeContent>) => void
  setGeometry: (id: string, geometry: Geometry) => void
  setParent: (id: string, parent: string | null, order: string) => void
  setOrder: (id: string, order: string) => void
  registerSchema: (schema: Schema) => void

  // Bulk replace (used on canvas reload)
  replace: (newDoc: Document) => void

  // Diagnostics
  warnings: () => readonly Warning[]
}

/** Sentinel key used in parentToChildren for top-level (root) nodes. */
const ROOT_KEY = '__root__'

function compareOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function createCanvasIndex(initialDoc: Document): CanvasIndex {
  const [store, setStore] = createStore<{ doc: Document }>({ doc: initialDoc })

  // Derived state — built once, updated incrementally on writes
  const parentToChildren = new Map<string, string[]>()
  const schemaForNode = new Map<string, Schema>()
  const contentForNode = new Map<string, NodeContent>()
  const _warnings: Warning[] = []

  // Build initial indices from the initial document
  rebuildAllIndices()

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  function rebuildAllIndices() {
    buildParentToChildren()
    buildSchemaForNode()
    buildContentForNode()
    detectCycles()
  }

  function buildParentToChildren() {
    parentToChildren.clear()
    for (const [id, n] of Object.entries(store.doc.structure)) {
      const key = n.parent ?? ROOT_KEY
      if (!parentToChildren.has(key)) parentToChildren.set(key, [])
      parentToChildren.get(key)!.push(id)
    }
    // Sort each child list by order
    for (const list of parentToChildren.values()) {
      list.sort((a, b) => {
        const oa = store.doc.structure[a]?.order ?? ''
        const ob = store.doc.structure[b]?.order ?? ''
        return compareOrder(oa, ob)
      })
    }
  }

  function buildSchemaForNode() {
    schemaForNode.clear()
    // Reset only schema/missing-schema warnings; cycle warnings are rebuilt by detectCycles
    _warnings.length = 0
    for (const [id, n] of Object.entries(store.doc.structure)) {
      const schema = store.doc.schemas[n.schemaName]
      if (schema) {
        schemaForNode.set(id, schema)
      } else {
        _warnings.push({
          kind: 'missing-schema',
          nodeId: id,
          schemaName: n.schemaName,
          message: `node ${id} references unknown schema "${n.schemaName}"`,
        })
      }
    }
  }

  function buildContentForNode() {
    contentForNode.clear()
    for (const [id, c] of Object.entries(store.doc.content)) {
      contentForNode.set(id, c)
    }
  }

  function detectCycles() {
    // Walk up the parent chain from each node; if we revisit the start node, it's a cycle.
    const structure = store.doc.structure
    for (const id of Object.keys(structure)) {
      const visited = new Set<string>()
      let current: string | null = id
      while (current !== null) {
        if (visited.has(current)) {
          _warnings.push({
            kind: 'cycle',
            nodeId: id,
            message: `node ${id} is part of a parent cycle (revisited ${current})`,
          })
          break
        }
        visited.add(current)
        current = structure[current]?.parent ?? null
      }
    }
  }

  function hasCycleAt(id: string, newParent: string | null): boolean {
    // Walk up from newParent; if we reach id, setting id.parent = newParent would create a cycle.
    if (newParent === null) return false
    const structure = store.doc.structure
    const visited = new Set<string>()
    let current: string | null = newParent
    while (current !== null) {
      if (current === id) return true
      if (visited.has(current)) break // existing cycle in the tree — stop
      visited.add(current)
      current = structure[current]?.parent ?? null
    }
    return false
  }

  function sortChildList(parentKey: string) {
    const list = parentToChildren.get(parentKey)
    if (!list) return
    list.sort((a, b) => {
      const oa = store.doc.structure[a]?.order ?? ''
      const ob = store.doc.structure[b]?.order ?? ''
      return compareOrder(oa, ob)
    })
  }

  function removeFromParentList(childId: string, parentKey: string) {
    const list = parentToChildren.get(parentKey)
    if (!list) return
    const idx = list.indexOf(childId)
    if (idx !== -1) list.splice(idx, 1)
    if (list.length === 0) parentToChildren.delete(parentKey)
  }

  function addToParentList(childId: string, parentKey: string) {
    if (!parentToChildren.has(parentKey)) parentToChildren.set(parentKey, [])
    parentToChildren.get(parentKey)!.push(childId)
    sortChildList(parentKey)
  }

  // ---------------------------------------------------------------------------
  // Mutators
  // ---------------------------------------------------------------------------

  function createNode(structure: NodeStructure, content: NodeContent) {
    setStore('doc', produce((d: Document) => {
      d.structure[structure.id] = structure
      d.content[structure.id] = content
    }))

    // Update indices
    const parentKey = structure.parent ?? ROOT_KEY
    addToParentList(structure.id, parentKey)

    const schema = store.doc.schemas[structure.schemaName]
    if (schema) {
      schemaForNode.set(structure.id, schema)
    } else {
      _warnings.push({
        kind: 'missing-schema',
        nodeId: structure.id,
        schemaName: structure.schemaName,
        message: `node ${structure.id} references unknown schema "${structure.schemaName}"`,
      })
    }

    contentForNode.set(structure.id, content)
  }

  function deleteNode(id: string) {
    const node = store.doc.structure[id]
    if (!node) return

    const oldParentKey = node.parent ?? ROOT_KEY

    // Re-parent children to null (root)
    const children = parentToChildren.get(id) ? [...(parentToChildren.get(id)!)] : []
    if (children.length > 0) {
      setStore('doc', produce((d: Document) => {
        for (const childId of children) {
          if (d.structure[childId]) {
            d.structure[childId].parent = null
          }
        }
      }))
      // Move children from id's list to root list
      parentToChildren.delete(id)
      for (const childId of children) {
        addToParentList(childId, ROOT_KEY)
      }
    }

    // Remove edges referencing id
    setStore('doc', produce((d: Document) => {
      for (const [edgeId, edge] of Object.entries(d.edges)) {
        if (edge.fromId === id || edge.toId === id) {
          delete d.edges[edgeId]
        }
      }
      delete d.structure[id]
      delete d.content[id]
    }))

    // Update indices
    removeFromParentList(id, oldParentKey)
    schemaForNode.delete(id)
    contentForNode.delete(id)
  }

  function setContent(id: string, patch: Partial<NodeContent>) {
    setStore('doc', 'content', id, (c: NodeContent) => ({ ...c, ...patch }))
    // Re-set alias to the updated object from the store
    const updated = store.doc.content[id]
    if (updated !== undefined) {
      contentForNode.set(id, updated)
    }
  }

  function setGeometry(id: string, geometry: Geometry) {
    setStore('doc', 'structure', id, 'geometry', geometry)
    // Geometry is not indexed — no index update needed
  }

  function setParent(id: string, parent: string | null, order: string) {
    const node = store.doc.structure[id]
    if (!node) return

    if (hasCycleAt(id, parent)) {
      _warnings.push({
        kind: 'cycle',
        nodeId: id,
        message: `setParent(${id}, ${parent}) would create a cycle — write rejected`,
      })
      return
    }

    const oldParentKey = node.parent ?? ROOT_KEY
    const newParentKey = parent ?? ROOT_KEY

    setStore('doc', 'structure', id, { parent, order })

    // Update parentToChildren
    removeFromParentList(id, oldParentKey)
    addToParentList(id, newParentKey)
  }

  function setOrder(id: string, order: string) {
    const node = store.doc.structure[id]
    if (!node) return

    setStore('doc', 'structure', id, 'order', order)

    const parentKey = node.parent ?? ROOT_KEY
    sortChildList(parentKey)
  }

  function registerSchema(schema: Schema) {
    setStore('doc', 'schemas', schema.name, schema)

    // Refresh schemaForNode for all nodes referencing this schema
    for (const [id, n] of Object.entries(store.doc.structure)) {
      if (n.schemaName === schema.name) {
        schemaForNode.set(id, schema)
        // Remove any missing-schema warnings for this node
        const wIdx = _warnings.findIndex(
          w => w.kind === 'missing-schema' && w.nodeId === id
        )
        if (wIdx !== -1) _warnings.splice(wIdx, 1)
      }
    }
  }

  function replace(newDoc: Document) {
    setStore('doc', newDoc)
    parentToChildren.clear()
    schemaForNode.clear()
    contentForNode.clear()
    _warnings.length = 0
    rebuildAllIndices()
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  function getNode(id: string): NodeStructure | undefined {
    return store.doc.structure[id]
  }

  function getContent(id: string): NodeContent | undefined {
    return contentForNode.get(id)
  }

  function getSchema(id: string): Schema | undefined {
    return schemaForNode.get(id)
  }

  function getChildren(id: string | null): string[] {
    const key = id ?? ROOT_KEY
    return parentToChildren.get(key) ?? []
  }

  return {
    doc: () => store.doc,
    parentToChildren,
    schemaForNode,
    contentForNode,
    getNode,
    getContent,
    getSchema,
    getChildren,
    createNode,
    deleteNode,
    setContent,
    setGeometry,
    setParent,
    setOrder,
    registerSchema,
    replace,
    warnings: () => _warnings,
  }
}
