import type { LayoutNode, LayoutEdge, LayoutResult } from './layout.js'

export type { LayoutNode, LayoutEdge, LayoutResult }

export interface TreeLayoutOptions {
  /** Horizontal gap between sibling nodes. Default: 40 */
  horizontalGap?: number
  /** Vertical gap between ranks (layers). Default: 80 */
  verticalGap?: number
  /** Layout direction. Default: 'top-down' */
  direction?: 'top-down' | 'left-right'
}

export function treeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options?: TreeLayoutOptions
): LayoutResult {
  if (nodes.length === 0) return new Map()

  const horizontalGap = options?.horizontalGap ?? 40
  const verticalGap = options?.verticalGap ?? 80
  const direction = options?.direction ?? 'top-down'

  // Phase 1: Build adjacency and find roots
  const children = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const nodeSet = new Set(nodes.map((n) => n.id))

  for (const n of nodes) {
    children.set(n.id, [])
    inDegree.set(n.id, 0)
  }

  for (const e of edges) {
    if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) continue
    children.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  // Find roots: nodes with inDegree === 0
  let roots = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id)

  // If no roots found (all nodes in cycles), pick lowest inDegree node
  if (roots.length === 0) {
    const minDeg = Math.min(...nodes.map((n) => inDegree.get(n.id) ?? 0))
    const candidates = nodes.filter((n) => inDegree.get(n.id) === minDeg).map((n) => n.id)
    candidates.sort()
    roots = [candidates[0]]
    if (import.meta.env.DEV) {
      console.warn('[treeLayout] Cycle detected — picking arbitrary root:', candidates[0])
    }
  }

  // Phase 2: BFS rank assignment
  const rank = new Map<string, number>()
  const parent = new Map<string, string | null>() // for subtree tracking

  const queue: Array<{ id: string; r: number }> = []
  for (const rootId of roots) {
    queue.push({ id: rootId, r: 0 })
    rank.set(rootId, 0)
    parent.set(rootId, null)
  }

  // BFS
  let qi = 0
  while (qi < queue.length) {
    const { id, r } = queue[qi++]
    for (const childId of children.get(id) ?? []) {
      if (rank.has(childId)) {
        // Already visited (diamond/cycle back-edge) — skip
        if (import.meta.env.DEV) {
          if (rank.get(childId)! <= r) {
            console.warn('[treeLayout] Back edge or diamond detected:', id, '->', childId)
          }
        }
        continue
      }
      rank.set(childId, r + 1)
      parent.set(childId, id)
      queue.push({ id: childId, r: r + 1 })
    }
  }

  // Any node not reached by BFS (disconnected from all roots due to cycles) gets rank 0
  for (const n of nodes) {
    if (!rank.has(n.id)) {
      rank.set(n.id, 0)
      parent.set(n.id, null)
    }
  }

  // Group nodes by BFS order (queue order preserves traversal order within ranks)
  // Build ordered node list per rank from BFS queue
  const rankOrder = new Map<number, string[]>()
  for (const { id } of queue) {
    const r = rank.get(id)!
    if (!rankOrder.has(r)) rankOrder.set(r, [])
    rankOrder.get(r)!.push(id)
  }
  // Add any nodes that weren't reached via BFS (isolated within a cycle)
  for (const n of nodes) {
    const r = rank.get(n.id)!
    if (!rankOrder.has(r)) rankOrder.set(r, [])
    if (!rankOrder.get(r)!.includes(n.id)) {
      rankOrder.get(r)!.push(n.id)
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // Phase 3: Assign initial x positions within each rank
  // Compute max height per rank for y-spacing
  const rankMaxHeight = new Map<number, number>()
  for (const [r, ids] of rankOrder) {
    const maxH = Math.max(...ids.map((id) => nodeById.get(id)!.height))
    rankMaxHeight.set(r, maxH)
  }

  // Cumulative y positions per rank
  const rankY = new Map<number, number>()
  const sortedRanks = [...rankOrder.keys()].sort((a, b) => a - b)
  let cumY = 0
  for (const r of sortedRanks) {
    rankY.set(r, cumY)
    cumY += (rankMaxHeight.get(r) ?? 0) + verticalGap
  }

  // Initial x assignment: left-to-right within each rank
  const x = new Map<string, number>()
  for (const [, ids] of rankOrder) {
    let curX = 0
    for (const id of ids) {
      x.set(id, curX)
      curX += nodeById.get(id)!.width + horizontalGap
    }
  }

  // Phase 4: Center parents over children (bottom-up), then resolve overlaps (top-down)
  // We do this per-tree to avoid cross-tree interference

  // Find connected components (each root is a tree root)
  // We'll do the centering for all trees together using the BFS parent map

  // Bottom-up: process ranks from deepest to shallowest
  for (let ri = sortedRanks.length - 1; ri >= 0; ri--) {
    const r = sortedRanks[ri]
    const ids = rankOrder.get(r)!
    for (const id of ids) {
      const childIds = (children.get(id) ?? []).filter((c) => rank.get(c) === r + 1 && parent.get(c) === id)
      // Only center over children that BFS assigned to this parent
      // (for diamond DAGs, child's parent is first BFS parent)
      const childrenWithPos = childIds.filter((c) => x.has(c))
      if (childrenWithPos.length === 0) continue
      const childXs = childrenWithPos.map((c) => x.get(c)! + nodeById.get(c)!.width / 2)
      const minChildX = Math.min(...childXs)
      const maxChildX = Math.max(...childXs)
      const midpoint = (minChildX + maxChildX) / 2
      x.set(id, midpoint - nodeById.get(id)!.width / 2)
    }
  }

  // Top-down overlap resolution: for each rank, ensure nodes don't overlap
  // Walk through each rank and shift nodes right if they overlap with previous node
  for (const r of sortedRanks) {
    const ids = rankOrder.get(r)!
    if (ids.length <= 1) continue

    // Sort by current x position
    const sorted = [...ids].sort((a, b) => x.get(a)! - x.get(b)!)

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      const prevRight = x.get(prev)! + nodeById.get(prev)!.width + horizontalGap
      if (x.get(curr)! < prevRight) {
        const shift = prevRight - x.get(curr)!
        // Shift curr and all its descendants
        shiftSubtree(curr, shift, x, children, rank, parent)
      }
    }
  }

  // Re-center parents over children after overlap resolution (one more bottom-up pass)
  for (let ri = sortedRanks.length - 1; ri >= 0; ri--) {
    const r = sortedRanks[ri]
    const ids = rankOrder.get(r)!
    for (const id of ids) {
      const childIds = (children.get(id) ?? []).filter((c) => rank.get(c) === r + 1 && parent.get(c) === id)
      const childrenWithPos = childIds.filter((c) => x.has(c))
      if (childrenWithPos.length === 0) continue
      const childXs = childrenWithPos.map((c) => x.get(c)! + nodeById.get(c)!.width / 2)
      const midpoint = (Math.min(...childXs) + Math.max(...childXs)) / 2
      x.set(id, midpoint - nodeById.get(id)!.width / 2)
    }
  }

  // Multiple roots: offset trees horizontally so they don't overlap
  // Find connected components and their x-extents, then shift
  const treeRoots = [...parent.entries()].filter(([, p]) => p === null).map(([id]) => id)
  if (treeRoots.length > 1) {
    // For each root, collect its subtree nodes
    let offsetX = 0
    for (const rootId of treeRoots) {
      const subtreeNodes = getSubtree(rootId, children, parent)
      // Find current min x of this subtree
      const minX = Math.min(...subtreeNodes.map((id) => x.get(id) ?? 0))
      const shift = offsetX - minX
      for (const id of subtreeNodes) {
        x.set(id, (x.get(id) ?? 0) + shift)
      }
      // Find max x of this subtree after shift
      const maxX = Math.max(...subtreeNodes.map((id) => (x.get(id) ?? 0) + nodeById.get(id)!.width))
      offsetX = maxX + horizontalGap * 2
    }
  }

  // Build result
  const result: LayoutResult = new Map()
  for (const n of nodes) {
    const nx = x.get(n.id) ?? 0
    const ny = rankY.get(rank.get(n.id)!) ?? 0
    if (direction === 'left-right') {
      result.set(n.id, { x: Math.round(ny), y: Math.round(nx) })
    } else {
      result.set(n.id, { x: Math.round(nx), y: Math.round(ny) })
    }
  }
  return result
}

/** Shift a node and all its BFS-assigned descendants by `delta` in x. */
function shiftSubtree(
  id: string,
  delta: number,
  x: Map<string, number>,
  children: Map<string, string[]>,
  rank: Map<string, number>,
  parent: Map<string, string | null>
): void {
  const stack = [id]
  while (stack.length > 0) {
    const cur = stack.pop()!
    x.set(cur, (x.get(cur) ?? 0) + delta)
    for (const child of children.get(cur) ?? []) {
      // Only shift children whose BFS parent is `cur`
      if (parent.get(child) === cur && rank.get(child)! > rank.get(cur)!) {
        stack.push(child)
      }
    }
  }
}

/** Collect all nodes in a subtree rooted at `rootId` (using BFS parent relationship). */
function getSubtree(
  rootId: string,
  children: Map<string, string[]>,
  parent: Map<string, string | null>
): string[] {
  const result: string[] = []
  const stack = [rootId]
  while (stack.length > 0) {
    const cur = stack.pop()!
    result.push(cur)
    for (const child of children.get(cur) ?? []) {
      if (parent.get(child) === cur) {
        stack.push(child)
      }
    }
  }
  return result
}
