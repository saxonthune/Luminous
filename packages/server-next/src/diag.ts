import type { V2Document, Geometry } from "./types.js"
import { isNodeSchema } from "./types.js"

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface BBoxRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface RootsSummary {
  totalNodes: number
  rootCount: number
  byCategory: Record<string, {
    count: number
    maxH: number
    maxW: number
    bbox: BBoxRect
    tallestId: string
    tallestH: number
  }>
}

export interface NodeBbox {
  id: string
  geometry: Geometry
  descendantCount: number
  descendantBbox: BBoxRect | null
  containerHealth: 'ok' | 'descendants-overflow' | 'descendants-undersized'
}

export interface OutlierEntry {
  id: string
  schemaName: string
  geometry: Geometry
  flags: string[]
}

export interface OutliersList {
  totalChecked: number
  outliers: OutlierEntry[]
}

export interface SubtreeNode {
  id: string
  schemaName: string
  parent: string | null
  geometry: Geometry
  depth: number
}

export interface SubtreeDump {
  rootId: string
  nodes: SubtreeNode[]
  truncated?: true
}

export interface OutlineNode {
  id: string
  title: string | null
  schemaName: string
  depth: number
  geometry: Geometry
  children: OutlineNode[]
}

export interface OutlineResult {
  rootId: string | null
  nodes: OutlineNode[]
  truncated?: true
}

export interface SummaryResult {
  totalNodes: number
  rootCount: number
  edgeCount: number
  maxDepth: number
  schemaCounts: Record<string, number>
  bbox: BBoxRect | null
}

export interface QueryFilter {
  type?: string
  parent?: string | null
  ids?: string[]
  root?: boolean
}

export interface QueryResultNode {
  id: string
  title?: string | null
  schemaName?: string
  parent?: string | null
  geometry?: Geometry
}

export interface QueryResult {
  nodes: QueryResultNode[]
  truncated?: true
  totalMatched: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function expandBbox(bbox: BBoxRect | null, g: Geometry): BBoxRect {
  if (bbox === null) {
    return { minX: g.x, minY: g.y, maxX: g.x + g.w, maxY: g.y + g.h }
  }
  return {
    minX: Math.min(bbox.minX, g.x),
    minY: Math.min(bbox.minY, g.y),
    maxX: Math.max(bbox.maxX, g.x + g.w),
    maxY: Math.max(bbox.maxY, g.y + g.h),
  }
}

/** Build a parent → children[] index from doc.structure. */
function buildChildrenIndex(doc: V2Document): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const node of Object.values(doc.structure)) {
    const parentKey = node.parent ?? "__root__"
    const list = index.get(parentKey)
    if (list) {
      list.push(node.id)
    } else {
      index.set(parentKey, [node.id])
    }
  }
  return index
}

/** Best-effort title resolver. Returns null at any failure — never throws. */
function resolveTitle(doc: V2Document, nodeId: string): string | null {
  const node = doc.structure[nodeId]
  if (!node) return null
  const schema = doc.schemas[node.schemaName]
  if (!schema) return null
  if (!isNodeSchema(schema)) return null
  const prim = schema.primitives.find(p => p.type === 'title')
  if (!prim || prim.bind === undefined) return null
  const value = doc.content[nodeId]?.[prim.bind]
  if (typeof value !== 'string') return null
  return value
}

// ---------------------------------------------------------------------------
// roots
// ---------------------------------------------------------------------------

export function roots(doc: V2Document): RootsSummary {
  const allNodes = Object.values(doc.structure)
  const rootNodes = allNodes.filter(n => n.parent === null)

  type CategoryEntry = {
    count: number
    maxH: number
    maxW: number
    bbox: BBoxRect | null
    tallestId: string
    tallestH: number
  }
  const byCat: Record<string, CategoryEntry> = {}

  for (const node of rootNodes) {
    const cat = node.schemaName
    if (!byCat[cat]) {
      byCat[cat] = { count: 0, maxH: 0, maxW: 0, bbox: null, tallestId: node.id, tallestH: 0 }
    }
    const entry = byCat[cat]
    entry.count++
    entry.bbox = expandBbox(entry.bbox, node.geometry)
    if (node.geometry.h > entry.maxH) {
      entry.maxH = node.geometry.h
      entry.tallestId = node.id
      entry.tallestH = node.geometry.h
    }
    if (node.geometry.w > entry.maxW) {
      entry.maxW = node.geometry.w
    }
  }

  const byCategory: RootsSummary['byCategory'] = {}
  for (const [cat, entry] of Object.entries(byCat)) {
    byCategory[cat] = {
      count: entry.count,
      maxH: entry.maxH,
      maxW: entry.maxW,
      bbox: entry.bbox!,
      tallestId: entry.tallestId,
      tallestH: entry.tallestH,
    }
  }

  return { totalNodes: allNodes.length, rootCount: rootNodes.length, byCategory }
}

// ---------------------------------------------------------------------------
// bbox
// ---------------------------------------------------------------------------

export function bbox(doc: V2Document, id: string): NodeBbox | null {
  const node = doc.structure[id]
  if (!node) return null

  const childrenIndex = buildChildrenIndex(doc)

  // BFS tracking absolute position relative to the query root.
  // Each entry: [nodeId, offsetX, offsetY] where the offset is the
  // accumulated parent chain offset relative to the query node's origin.
  type QEntry = { nodeId: string; offsetX: number; offsetY: number }

  const initialChildren = childrenIndex.get(id) ?? []
  const queue: QEntry[] = initialChildren.map(cid => ({ nodeId: cid, offsetX: 0, offsetY: 0 }))

  let descendantBbox: BBoxRect | null = null
  let descendantCount = 0
  const visited = new Set<string>()
  let qi = 0

  while (qi < queue.length) {
    const { nodeId, offsetX, offsetY } = queue[qi++]
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const child = doc.structure[nodeId]
    if (!child) continue
    descendantCount++

    // Convert child geometry to query-root coordinate space
    const absX = offsetX + child.geometry.x
    const absY = offsetY + child.geometry.y
    const absGeom: Geometry = { x: absX, y: absY, w: child.geometry.w, h: child.geometry.h }
    descendantBbox = expandBbox(descendantBbox, absGeom)

    // Enqueue grandchildren; their geometry is relative to this child
    const grandchildren = childrenIndex.get(nodeId) ?? []
    for (const gc of grandchildren) {
      queue.push({ nodeId: gc, offsetX: absX, offsetY: absY })
    }
  }

  // Evaluate container health
  let containerHealth: NodeBbox['containerHealth'] = 'ok'
  if (descendantBbox !== null) {
    const tolerance = 10
    if (
      descendantBbox.maxX > node.geometry.w + tolerance ||
      descendantBbox.maxY > node.geometry.h + tolerance
    ) {
      containerHealth = 'descendants-overflow'
    } else {
      const bboxW = descendantBbox.maxX - descendantBbox.minX
      const bboxH = descendantBbox.maxY - descendantBbox.minY
      if (bboxW < node.geometry.w * 0.5 || bboxH < node.geometry.h * 0.5) {
        containerHealth = 'descendants-undersized'
      }
    }
  }

  return { id, geometry: node.geometry, descendantCount, descendantBbox, containerHealth }
}

// ---------------------------------------------------------------------------
// outliers
// ---------------------------------------------------------------------------

export function outliers(doc: V2Document): OutliersList {
  const allNodes = Object.values(doc.structure)
  const result: OutlierEntry[] = []

  for (const node of allNodes) {
    const flags: string[] = []
    const g = node.geometry

    if (g.h > 5000) flags.push('h-too-large')
    if (g.w > 4000) flags.push('w-too-large')
    if (g.h < 5 || g.w < 5) flags.push('tiny')

    if (node.parent !== null) {
      const parent = doc.structure[node.parent]
      if (parent) {
        const pg = parent.geometry
        if (g.x + g.w > pg.w + 10 || g.y + g.h > pg.h + 10) {
          flags.push('overflow-parent')
        }
      }
    }

    if (flags.length > 0) {
      result.push({ id: node.id, schemaName: node.schemaName, geometry: g, flags })
    }
  }

  result.sort((a, b) => Math.max(b.geometry.h, b.geometry.w) - Math.max(a.geometry.h, a.geometry.w))

  return {
    totalChecked: allNodes.length,
    outliers: result.slice(0, 50),
  }
}

// ---------------------------------------------------------------------------
// subtree
// ---------------------------------------------------------------------------

export function subtree(doc: V2Document, id: string): SubtreeDump | null {
  const root = doc.structure[id]
  if (!root) return null

  const childrenIndex = buildChildrenIndex(doc)
  const CAP = 500

  type QEntry = { nodeId: string; depth: number }
  const queue: QEntry[] = [{ nodeId: id, depth: 0 }]
  const nodes: SubtreeNode[] = []
  const visited = new Set<string>()
  let qi = 0
  let truncated = false

  while (qi < queue.length) {
    if (nodes.length >= CAP) {
      truncated = true
      break
    }
    const { nodeId, depth } = queue[qi++]
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = doc.structure[nodeId]
    if (!node) continue

    nodes.push({
      id: node.id,
      schemaName: node.schemaName,
      parent: node.parent,
      geometry: node.geometry,
      depth,
    })

    const children = childrenIndex.get(nodeId) ?? []
    for (const cid of children) {
      queue.push({ nodeId: cid, depth: depth + 1 })
    }
  }

  const result: SubtreeDump = { rootId: id, nodes }
  if (truncated) result.truncated = true
  return result
}

// ---------------------------------------------------------------------------
// outline
// ---------------------------------------------------------------------------

export function outline(doc: V2Document, rootId: string | null): OutlineResult {
  const childrenIndex = buildChildrenIndex(doc)
  const CAP = 500
  let count = 0
  let truncated = false

  function walkNode(nodeId: string, depth: number): OutlineNode | null {
    if (count >= CAP) {
      truncated = true
      return null
    }
    const node = doc.structure[nodeId]
    if (!node) return null
    count++
    const outlineNode: OutlineNode = {
      id: node.id,
      title: resolveTitle(doc, nodeId),
      schemaName: node.schemaName,
      depth,
      geometry: node.geometry,
      children: [],
    }
    const childIds = childrenIndex.get(nodeId) ?? []
    for (const cid of childIds) {
      if (count >= CAP) {
        truncated = true
        break
      }
      const child = walkNode(cid, depth + 1)
      if (child) outlineNode.children.push(child)
    }
    return outlineNode
  }

  let topLevelIds: string[]
  if (rootId === null) {
    topLevelIds = childrenIndex.get('__root__') ?? []
  } else {
    if (!doc.structure[rootId]) {
      return { rootId, nodes: [] }
    }
    topLevelIds = [rootId]
  }

  const nodes: OutlineNode[] = []
  for (const id of topLevelIds) {
    if (count >= CAP) {
      truncated = true
      break
    }
    const node = walkNode(id, 0)
    if (node) nodes.push(node)
  }

  const result: OutlineResult = { rootId, nodes }
  if (truncated) result.truncated = true
  return result
}

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

export function summary(doc: V2Document): SummaryResult {
  const allNodes = Object.values(doc.structure)
  const totalNodes = allNodes.length
  const rootNodes = allNodes.filter(n => n.parent === null)
  const rootCount = rootNodes.length
  const edgeCount = Object.keys(doc.edges).length

  const schemaCounts: Record<string, number> = {}
  for (const node of allNodes) {
    schemaCounts[node.schemaName] = (schemaCounts[node.schemaName] ?? 0) + 1
  }

  const childrenIndex = buildChildrenIndex(doc)
  let maxDepth = 0
  const visited = new Set<string>()

  type QEntry = { nodeId: string; depth: number }
  const queue: QEntry[] = rootNodes.map(n => ({ nodeId: n.id, depth: 0 }))
  let qi = 0
  let walkCount = 0
  const WALK_CAP = 500

  while (qi < queue.length && walkCount < WALK_CAP) {
    const { nodeId, depth } = queue[qi++]
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    walkCount++
    if (depth > maxDepth) maxDepth = depth
    const children = childrenIndex.get(nodeId) ?? []
    for (const cid of children) {
      queue.push({ nodeId: cid, depth: depth + 1 })
    }
  }

  let bbox: BBoxRect | null = null
  for (const node of rootNodes) {
    bbox = expandBbox(bbox, node.geometry)
  }

  return { totalNodes, rootCount, edgeCount, maxDepth, schemaCounts, bbox }
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

export function query(
  doc: V2Document,
  filter: QueryFilter,
  fields?: Array<'title' | 'schemaName' | 'parent' | 'geometry'>
): QueryResult {
  const effectiveFields = (fields && fields.length > 0) ? fields : ['title', 'schemaName'] as Array<'title' | 'schemaName' | 'parent' | 'geometry'>
  const CAP = 500

  const allNodes = Object.values(doc.structure)
  const matches: QueryResultNode[] = []
  let totalMatched = 0
  let truncated = false

  for (const node of allNodes) {
    if (filter.type !== undefined && node.schemaName !== filter.type) continue
    if (filter.parent !== undefined && node.parent !== filter.parent) continue
    if (filter.ids !== undefined && !filter.ids.includes(node.id)) continue
    if (filter.root === true && node.parent !== null) continue

    totalMatched++

    if (matches.length < CAP) {
      const result: QueryResultNode = { id: node.id }
      for (const field of effectiveFields) {
        if (field === 'title') result.title = resolveTitle(doc, node.id)
        else if (field === 'schemaName') result.schemaName = node.schemaName
        else if (field === 'parent') result.parent = node.parent
        else if (field === 'geometry') result.geometry = node.geometry
      }
      matches.push(result)
    } else {
      truncated = true
    }
  }

  const queryResult: QueryResult = { nodes: matches, totalMatched }
  if (truncated) queryResult.truncated = true
  return queryResult
}
