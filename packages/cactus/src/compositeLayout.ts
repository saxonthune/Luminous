import { tidyLayout, type TidyNode, type TidyLayoutOptions } from './tidyLayout.js'
import { treeLayout, type LayoutNode, type LayoutEdge, type TreeLayoutOptions } from './treeLayout.js'
import type { LayoutResult } from './layout.js'

export interface CompositeLayoutOptions {
  /** Optional options forwarded to the inner tidyLayout pass. */
  inner?: TidyLayoutOptions
  /** Optional options forwarded to the outer treeLayout pass. */
  outer?: TreeLayoutOptions
}

/**
 * Two-pass layout: inner tidyLayout for parent-child containment,
 * outer treeLayout for the top-level graph defined by `edges`.
 *
 * Pass 1 — tidyLayout: recursively sizes and positions all nodes so that
 * containers enclose their children. Top-level node sizes come from this pass.
 *
 * Pass 2 — treeLayout: positions top-level nodes (parentId === null) using
 * the edge relationships in `edges`. The measured widths/heights from pass 1
 * are used as node extents for the tree layout.
 *
 * The caller pre-filters `edges` to the subset that should feed the tree
 * layout (e.g. edges of a specific schemaName). Cactus does not inspect edge
 * metadata.
 *
 * Returns a LayoutResult (Map<id, {x, y}>) covering all nodes. Top-level
 * node positions come from the outer tree pass; inner children keep their
 * parent-relative positions from the tidy pass.
 */
export function compositeLayout(
  nodes: TidyNode[],
  edges: LayoutEdge[],
  options?: CompositeLayoutOptions
): LayoutResult {
  // Pass 1: tidy layout — sizes all nodes and positions inner children.
  const innerResult = tidyLayout(nodes, options?.inner)

  // Identify top-level nodes (parentId === null).
  const topLevel = nodes.filter((n) => n.parentId === null)

  if (topLevel.length === 0) {
    // No top-level nodes — return positions from inner pass (x/y only).
    const result: LayoutResult = new Map()
    for (const [id, rect] of innerResult) {
      result.set(id, { x: rect.x, y: rect.y })
    }
    return result
  }

  // Build LayoutNode[] for treeLayout using measured sizes from inner pass.
  const topLevelLayoutNodes: LayoutNode[] = topLevel.map((n) => {
    const measured = innerResult.get(n.id)
    return {
      id: n.id,
      x: measured?.x ?? 0,
      y: measured?.y ?? 0,
      width: measured?.w ?? n.w,
      height: measured?.h ?? n.h,
    }
  })

  // Pass 2: tree layout — positions top-level nodes using supplied edges.
  const outerResult = treeLayout(topLevelLayoutNodes, edges, options?.outer)

  // Merge: start with inner positions (x/y), overwrite top-level x/y from outer pass.
  const result: LayoutResult = new Map()
  for (const [id, rect] of innerResult) {
    result.set(id, { x: rect.x, y: rect.y })
  }
  for (const [id, pos] of outerResult) {
    result.set(id, { x: pos.x, y: pos.y })
  }

  return result
}
