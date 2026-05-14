import type { LayoutEdge, LayoutResult } from './layout.js'
import type { TidyNode, TidyLayoutOptions } from './tidyLayout.js'
import { tidyLayout } from './tidyLayout.js'

export interface DagLayoutOptions {
  /** Options forwarded to the inner tidyLayout pass (sizing). */
  tidy?: TidyLayoutOptions
  /** Horizontal gap between siblings at the same rank. Default: 40 */
  horizontalGap?: number
  /** Vertical gap between ranks. Default: 80 */
  verticalGap?: number
}

/**
 * Recursive DAG layout: orders siblings at every nesting level so that
 * directed edges flow downward. Works by "lifting" edges — an edge between
 * two deeply nested nodes induces ordering on their nearest non-shared
 * ancestors at each level of the tree.
 *
 * Pass 1 — tidyLayout: sizes all nodes (containers fit children).
 * Pass 2 — at each nesting level, build a DAG of siblings from lifted
 *           edges, topologically sort, and assign y-ranks.
 * Pass 3 — position nodes within ranks, recursing into containers.
 */
export function dagLayout(
  nodes: TidyNode[],
  edges: LayoutEdge[],
  options?: DagLayoutOptions
): LayoutResult {
  const horizontalGap = options?.horizontalGap ?? 40
  const verticalGap = options?.verticalGap ?? 80

  // Pass 1: tidy layout for sizing
  const tidyResult = tidyLayout(nodes, options?.tidy)

  // Build lookup structures
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string | null, string[]>()
  for (const n of nodes) {
    const p = n.parentId ?? null
    if (!childrenOf.has(p)) childrenOf.set(p, [])
    childrenOf.get(p)!.push(n.id)
  }

  // Precompute ancestor chain for every node (from node up to root)
  const ancestorChain = new Map<string, string[]>()
  function getAncestors(id: string): string[] {
    if (ancestorChain.has(id)) return ancestorChain.get(id)!
    const chain = [id]
    const node = nodeMap.get(id)
    if (node?.parentId && nodeMap.has(node.parentId)) {
      chain.push(...getAncestors(node.parentId))
    }
    ancestorChain.set(id, chain)
    return chain
  }
  for (const n of nodes) getAncestors(n.id)

  // For a given parent scope, find which child (direct descendant) a node
  // belongs to. Returns undefined if the node is not under this parent.
  function childInScope(nodeId: string, parentId: string | null): string | undefined {
    const chain = ancestorChain.get(nodeId)
    if (!chain) return undefined
    if (parentId === null) {
      // root scope: return the last element in the chain (the root ancestor)
      return chain[chain.length - 1]
    }
    // Find parentId in chain, return the element before it (its direct child)
    const idx = chain.indexOf(parentId)
    if (idx <= 0) return undefined
    return chain[idx - 1]
  }

  // Pass 2: For each nesting level, build sibling ordering from lifted edges
  // Returns a Map<parentId, orderedChildIds[]>
  const siblingOrder = new Map<string | null, string[]>()

  function orderChildren(parentId: string | null) {
    const children = childrenOf.get(parentId) ?? []
    if (children.length === 0) {
      siblingOrder.set(parentId, [])
      return
    }

    // Recurse first — order grandchildren before using their structure
    for (const childId of children) {
      if ((childrenOf.get(childId) ?? []).length > 0) {
        orderChildren(childId)
      }
    }

    if (children.length === 1) {
      siblingOrder.set(parentId, children)
      return
    }

    // Build vote counts: for each directed edge, lift to this scope's children
    // votes[a][b] = number of edges from a's subtree to b's subtree
    const childSet = new Set(children)
    const votes = new Map<string, Map<string, number>>()
    for (const c of children) votes.set(c, new Map())

    for (const edge of edges) {
      const fromChild = childInScope(edge.source, parentId)
      const toChild = childInScope(edge.target, parentId)
      if (!fromChild || !toChild) continue
      if (fromChild === toChild) continue  // internal edge, doesn't affect sibling order
      if (!childSet.has(fromChild) || !childSet.has(toChild)) continue

      const existing = votes.get(fromChild)!.get(toChild) ?? 0
      votes.get(fromChild)!.set(toChild, existing + 1)
    }

    // Build net-direction DAG edges between siblings
    const dagEdges: Array<{ from: string; to: string }> = []
    const visited = new Set<string>()
    for (const a of children) {
      for (const b of children) {
        if (a === b) continue
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        if (visited.has(key)) continue
        visited.add(key)

        const ab = votes.get(a)?.get(b) ?? 0
        const ba = votes.get(b)?.get(a) ?? 0
        if (ab > ba) dagEdges.push({ from: a, to: b })
        else if (ba > ab) dagEdges.push({ from: b, to: a })
        // tie: no ordering constraint
      }
    }

    // Topological sort (Kahn's algorithm)
    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()
    for (const c of children) {
      inDegree.set(c, 0)
      adj.set(c, [])
    }
    for (const e of dagEdges) {
      adj.get(e.from)!.push(e.to)
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
    }

    const queue: string[] = []
    for (const c of children) {
      if (inDegree.get(c) === 0) queue.push(c)
    }

    const sorted: string[] = []
    let qi = 0
    while (qi < queue.length) {
      const cur = queue[qi++]
      sorted.push(cur)
      for (const next of adj.get(cur) ?? []) {
        const deg = (inDegree.get(next) ?? 1) - 1
        inDegree.set(next, deg)
        if (deg === 0) queue.push(next)
      }
    }

    // Any nodes not reached (cycle) — append in original order
    for (const c of children) {
      if (!sorted.includes(c)) sorted.push(c)
    }

    siblingOrder.set(parentId, sorted)
  }

  orderChildren(null)

  // Pass 3: Assign positions using topological ranks
  // At each scope, siblings in the same topological rank go side by side,
  // ranks stack vertically.
  const result: LayoutResult = new Map()

  function positionChildren(
    parentId: string | null,
    offsetX: number,
    offsetY: number
  ): { w: number; h: number } {
    const ordered = siblingOrder.get(parentId) ?? []
    if (ordered.length === 0) return { w: 0, h: 0 }

    // Assign ranks via BFS through the DAG edges for this scope
    const children = new Set(ordered)
    const adj = new Map<string, string[]>()
    const inDeg = new Map<string, number>()
    for (const c of ordered) {
      adj.set(c, [])
      inDeg.set(c, 0)
    }
    for (const edge of edges) {
      const fromChild = childInScope(edge.source, parentId)
      const toChild = childInScope(edge.target, parentId)
      if (!fromChild || !toChild || fromChild === toChild) continue
      if (!children.has(fromChild) || !children.has(toChild)) continue

      // Only add if net direction agrees
      const forward = edges.filter((e) => {
        const f = childInScope(e.source, parentId)
        const t = childInScope(e.target, parentId)
        return f === fromChild && t === toChild
      }).length
      const backward = edges.filter((e) => {
        const f = childInScope(e.source, parentId)
        const t = childInScope(e.target, parentId)
        return f === toChild && t === fromChild
      }).length
      if (forward > backward) {
        if (!adj.get(fromChild)!.includes(toChild)) {
          adj.get(fromChild)!.push(toChild)
          inDeg.set(toChild, (inDeg.get(toChild) ?? 0) + 1)
        }
      }
    }

    // BFS rank assignment
    const rank = new Map<string, number>()
    const queue: string[] = []
    for (const c of ordered) {
      if (inDeg.get(c) === 0) {
        rank.set(c, 0)
        queue.push(c)
      }
    }
    let qi = 0
    while (qi < queue.length) {
      const cur = queue[qi++]
      const r = rank.get(cur)!
      for (const next of adj.get(cur) ?? []) {
        const newRank = r + 1
        if (!rank.has(next) || rank.get(next)! < newRank) {
          rank.set(next, newRank)
        }
        inDeg.set(next, (inDeg.get(next) ?? 0) - 1)
        if (inDeg.get(next) === 0) queue.push(next)
      }
    }
    // Unranked nodes (cycles) get rank 0
    for (const c of ordered) {
      if (!rank.has(c)) rank.set(c, 0)
    }

    // Group by rank
    const rankGroups = new Map<number, string[]>()
    for (const c of ordered) {
      const r = rank.get(c)!
      if (!rankGroups.has(r)) rankGroups.set(r, [])
      rankGroups.get(r)!.push(c)
    }

    const sortedRanks = [...rankGroups.keys()].sort((a, b) => a - b)

    // Position each rank
    let curY = offsetY
    let totalW = 0

    for (const r of sortedRanks) {
      const group = rankGroups.get(r)!
      let curX = offsetX
      let rankMaxH = 0

      for (const id of group) {
        const measured = tidyResult.get(id)
        const node = nodeMap.get(id)!
        const w = measured?.w ?? node.w
        const h = measured?.h ?? node.h

        result.set(id, { x: curX, y: curY })

        // Recurse into children — position them relative to this node
        const innerChildren = childrenOf.get(id) ?? []
        if (innerChildren.length > 0) {
          // Children are positioned relative to parent, starting below header
          positionChildrenRelative(id)
        }

        curX += w + horizontalGap
        rankMaxH = Math.max(rankMaxH, h)
      }

      totalW = Math.max(totalW, curX - offsetX - horizontalGap)
      curY += rankMaxH + verticalGap
    }

    return { w: totalW, h: curY - offsetY - verticalGap }
  }

  // Position children relative to their parent (using tidy positions)
  function positionChildrenRelative(parentId: string) {
    const children = childrenOf.get(parentId) ?? []
    for (const childId of children) {
      const tidyPos = tidyResult.get(childId)
      if (tidyPos) {
        // tidy positions are relative to parent — keep them
        // (the parent's absolute position is already in result)
        result.set(childId, { x: tidyPos.x, y: tidyPos.y })
      }
      // Recurse
      const grandchildren = childrenOf.get(childId) ?? []
      if (grandchildren.length > 0) {
        positionChildrenRelative(childId)
      }
    }
  }

  positionChildren(null, 0, 0)

  return result
}
