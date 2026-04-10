---
title: Layout Primitives
status: active
summary: The layout algorithms cactus ships — tidyLayout, treeLayout, forceDirectedLayout, compositeLayout, dagLayout — with their contracts and when to use each
tags: [cactus, layout, algorithms]
deps: [doc01.02.05.01]
---

# Layout Primitives

Cactus ships four layout algorithms: `tidyLayout`, `treeLayout`, `forceDirectedLayout`, and `compositeLayout`. All are pure functions of node and edge structure — domain-agnostic, no schema interpretation. Callers supply measured sizes and pre-filtered edges; cactus applies geometry. None of these functions know what a "component" or a "signal" is.

## `tidyLayout`

**File:** `packages/cactus/src/tidyLayout.ts`

**Signature:**
```ts
function tidyLayout(nodes: TidyNode[], options?: TidyLayoutOptions): TidyResult
// TidyResult = Map<string, { x: number; y: number; w: number; h: number }>
```

**Input shape:** `TidyNode[]` — each node carries `id`, `w`, `h` (own content height, not including children), and `parentId | null`. No edge list.

**Output shape:** A `Map` from node ID to `{x, y, w, h}`. Positions are parent-relative for nested nodes; absolute for root nodes. Container nodes get grown `w`/`h` to enclose their children.

**Algorithm:** Post-order recursive layout. Sizes all children first, then packs them in a left-to-right wrapping grid below the parent's header area (`node.h + padding`). Wraps to the next row when a child would exceed `maxWidth`. Containers expand to fit. At root level, nodes are placed in a single left-to-right row unless `category` fields are set, in which case roots are bucketed by category and stacked in named rows.

**When to use:** Any time you have a containment hierarchy and want parent containers to auto-size around their children. This is the inner pass in `compositeLayout`.

**What it doesn't do:** Doesn't express tree depth visually (all children are siblings at the same level regardless of nesting depth). Not suitable for displaying edge-connected graphs — it ignores edges entirely.

## `treeLayout`

**File:** `packages/cactus/src/treeLayout.ts`

**Signature:**
```ts
function treeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options?: TreeLayoutOptions
): LayoutResult
// LayoutNode = { id: string; x: number; y: number; width: number; height: number }
// LayoutEdge = { source: string; target: string }
// LayoutResult = Map<string, { x: number; y: number }>
```

**Input shape:** Flat `LayoutNode[]` (no parentId — containment is not part of this layout), `LayoutEdge[]` defining directed relationships. Options: `horizontalGap` (default 40), `verticalGap` (default 80), `direction` (`'top-down'` or `'left-right'`, default `'top-down'`).

**Output shape:** `Map` from node ID to `{x, y}`. Width/height are not returned — caller supplies them.

**Algorithm:** Three-phase layered tree. (1) BFS rank assignment from roots (nodes with in-degree 0); if all nodes are in cycles, the lowest in-degree node becomes root with a warning. (2) Initial x positions assigned left-to-right per rank. (3) Bottom-up centering: parents are centered over their BFS children; top-down overlap resolution: nodes are shifted right if they overlap siblings; a second bottom-up pass re-centers after overlap resolution. Multiple disconnected trees are positioned side by side with no overlap.

**When to use:** Top-level positioning when edge relationships define depth (e.g., a component hierarchy expressed as edges). This is the outer pass in `compositeLayout`.

**What it doesn't do:** Doesn't pack siblings efficiently for wide trees — leaves spread horizontally. Treats all edges as tree edges; diamond DAGs assign each node to its first-seen BFS parent and warn on back edges.

## `forceDirectedLayout`

**File:** `packages/cactus/src/layout.ts`

**Signature:**
```ts
function forceDirectedLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options?: { iterations?: number; padding?: number }
): LayoutResult
```

**Input shape:** `LayoutNode[]` with current positions (used as simulation starting positions), `LayoutEdge[]`. Options: `iterations` (default 300), `padding` (default 20, added to collision radius).

**Output shape:** `Map` from node ID to `{x, y}`. Positions are in canvas coordinates.

**Algorithm:** Wraps d3-force: repulsion (`forceManyBody`, strength −300), spring links (`forceLink`, distance 200, strength 0.5), centering at the centroid of initial positions, and collision avoidance (`forceCollide` using the node's diagonal half-length plus padding). Runs synchronously for `iterations` ticks.

**When to use:** Freeform exploratory layout where no hierarchy is implied — general graphs, non-tree edge sets. Falls back gracefully with cycles or disconnected components.

**What it doesn't do:** Doesn't produce stable output for the same input (d3-force uses randomized initial velocities). Not suitable when deterministic, repeatable layout is needed.

## `compositeLayout`

**File:** `packages/cactus/src/compositeLayout.ts`

**Signature:**
```ts
function compositeLayout(
  nodes: TidyNode[],
  edges: LayoutEdge[],
  options?: CompositeLayoutOptions
): LayoutResult
// CompositeLayoutOptions = { inner?: TidyLayoutOptions; outer?: TreeLayoutOptions }
```

**Input shape:** `TidyNode[]` (same as `tidyLayout` — each node has `w`, `h`, `parentId`), `LayoutEdge[]` (pre-filtered by the caller to the edges that should drive the outer tree layout).

**Output shape:** `Map` from node ID to `{x, y}`. Top-level node positions come from the outer tree pass; nested children keep their parent-relative positions from the inner tidy pass.

**Algorithm:** Two-pass composition. Pass 1 (`tidyLayout`): recursively sizes all nodes so containers enclose their children — top-level nodes emerge with measured `w`/`h`. Pass 2 (`treeLayout`): positions top-level nodes using the measured sizes from pass 1 as node extents. Inner children receive the combined effect of both passes.

**When to use:** When you have a containment hierarchy (nodes nested inside parents) and a separate edge graph (e.g., component renders-edges) that should drive top-level positioning. This is the standard layout for the Solid.js pipeline canvas.

**What it doesn't do:** Doesn't position inner children by edges — inner layout is always tidy (wrapping grid). The outer tree only sees top-level nodes.

## `dagLayout`

**File:** `packages/cactus/src/dagLayout.ts`

**Signature:**
```ts
function dagLayout(
  nodes: TidyNode[],
  edges: LayoutEdge[],
  options?: DagLayoutOptions
): LayoutResult
// DagLayoutOptions = { tidy?: TidyLayoutOptions; horizontalGap?: number; verticalGap?: number }
```

**Input shape:** `TidyNode[]` (same as tidyLayout — nodes with `w`, `h`, `parentId`), `LayoutEdge[]` (all directed edges, not pre-filtered to tree-role only).

**Output shape:** `Map` from node ID to `{x, y}`. Covers all nodes including nested children.

**Algorithm:** Recursive edge-lifting DAG layout. At each nesting level, the algorithm:
1. "Lifts" edges — an edge between two deeply nested nodes induces an ordering on their nearest non-shared ancestors at that scope level.
2. Counts net votes between each pair of siblings: if more edges flow A→B than B→A, A ranks above B. Ties impose no constraint.
3. Topologically sorts siblings using Kahn's algorithm on the net-direction DAG.
4. Positions nodes by rank: same rank side-by-side, different ranks stacked vertically.
5. Recurses into containers to order their children the same way.

Pass 1 runs `tidyLayout` internally for sizing. Inner children keep their tidy-computed relative positions.

**When to use:** When you want all directed edges to flow downward (or left-to-right), even when edges connect nodes in different containers. This is the "preorder" layout — the topological sort determines a global ordering that respects edge direction at every nesting level. Particularly useful for pipeline/flowchart canvases where containers (phases) don't have direct edges between them but their children do.

**What it doesn't do:** Doesn't minimize edge crossings within ranks (a known Sugiyama optimization). Doesn't handle cycles gracefully beyond appending unranked nodes in original order.

## Composing Layouts

The composition pattern `compositeLayout` automates is:

1. Run `tidyLayout` to size each parent based on its children.
2. Use those measured parent sizes as node extents in `treeLayout` to position the parents.

The caller pre-filters edges before passing them to `compositeLayout` (or directly to `treeLayout`). Cactus does not filter by `schemaName` or any other field — the runtime (client-next) decides which edges participate in which layout pass:

```ts
// In the runtime (client-next), not in cactus
const treeEdges = doc.edges.filter(e => {
  const schema = doc.schemas[e.schemaName ?? '']
  return schema?.kind === 'edge' && schema.layoutRole === 'tree'
})
compositeLayout(nodes, treeEdges)  // cactus receives pre-filtered edges
```

Cactus never sees the literal strings `'tree'` or `'renders'`. It receives an edge list and treats every edge in that list as a tree edge. Filtering is a runtime concern; geometric algorithms are cactus's concern. This is the boundary.

See doc01.03.04 for the rationale behind the two-pass design.
