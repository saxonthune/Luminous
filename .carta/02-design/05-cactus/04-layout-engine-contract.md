---
title: Layout Engine Contract
summary: The LayoutEngine interface and mental model — how the domain layer produces constraints and cactus suggests positions
tags: [cactus, layout, architecture]
deps: [doc02.05.01, doc02.05.03]
---

# Layout Engine Contract

`03-layout-primitives.md` catalogs the *algorithms* cactus ships. This doc
describes the *contract* they should share and the mental model behind it: who
produces constraints, who suggests positions, and where the boundary sits.

## Mental Model: Two Roles

Layout is a conversation between two parties.

- **The constraint producer** is the domain layer (`client-next`). It knows
  what a node *is*, measures how big its rendered content turned out, derives
  the containment tree from declared edges, and knows which edges carry labels
  and how wide those labels are. It owns *meaning*.
- **The position suggester** is a cactus layout engine. It knows nothing about
  components, signals, or statecharts. It receives a structural description and
  returns coordinates. It owns *geometry*.

Cactus never interprets a `kind` or `schemaName` string. The producer
pre-filters and pre-measures; the engine consumes a normalized request. This is
the same boundary stated in `03-layout-primitives.md` — this doc formalizes the
data crossing it.

## The Contract

```ts
type LayoutEngine = (request: LayoutRequest) => LayoutResult | Promise<LayoutResult>;
```

A layout engine is a function. It may be synchronous (`gridLayout`) or
asynchronous (`elkLayout` wraps a worker). The caller awaits unconditionally.

### LayoutRequest

The producer assembles everything the engine needs in one object:

```ts
interface LayoutRequest {
  /** Containment tree — declared, never inferred from geometry. */
  rootIds: ReadonlyArray<string>;
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>;

  /** Measured intrinsic size of each node's own content (leaf size,
   *  or a container's header band — not including packed children). */
  nodeSizes: ReadonlyMap<string, { w: number; h: number }>;

  /** Per-container header reservation; falls back to a default. */
  headerHeights?: ReadonlyMap<string, number>;

  /** Edges that participate in layout, with optional measured label size
   *  so the engine can reserve routing channel space. */
  edges: ReadonlyArray<{
    id: string;
    from: string;
    to: string;
    label?: { w: number; h: number };
  }>;
}
```

### LayoutResult

```ts
interface LayoutResult {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  sizes: ReadonlyMap<string, { w: number; h: number }>;
  /** Optional routed edge geometry; engines that only place nodes omit it. */
  edgeRoutes?: ReadonlyMap<string, { points: ReadonlyArray<{ x: number; y: number }> }>;
}
```

## Invariants

These hold regardless of which engine runs.

### 1. Positions are ephemeral; the engine is their sole source

V3 graph files (`.canvases/*.graph.json`) persist **no geometry**. A node is
`{ id, kind, props, tags }` — there is no `x/y/w/h`. Positions are recomputed by
a layout engine on every render. There is no "saved layout" to fall back on.

> Consequence: a tool that reads a graph file cannot report node positions —
> there are none on disk. The MCP `diag`/`node` tools assume persisted
> `geometry`, so they do not apply to v3 graphs. To inspect computed positions,
> instrument the engine's `LayoutResult` or read the live rect registry
> (`getNodeRects`), not the file.

### 2. Containment is declared, never inferred

`childrenOf` comes from contain-role edges (e.g. `statechart.substate-of`,
`prim.contains`) resolved by `evaluateContainment`. The engine must *honor*
membership, never *discover* it by testing whether one rect sits inside
another. Geometric inference is fragile: a sub-pixel drift or a stale
mid-settle frame makes membership ambiguous. Every robust system (Graphviz
clusters, ELK hierarchy, tldraw frames) stores parent→child explicitly.

Geometry is an *output* of containment, not an input to it. The bottom-up walk
(see invariant 4) is how a container is *sized*; it is never how membership is
*decided*.

### 3. The engine is pure — calculation only, no DOM

A layout engine takes data and returns data. It does not touch the DOM, read
`getBoundingClientRect`, or mutate canvas state. All measurement happens in the
producer *before* the request is built. This keeps engines testable in
isolation and swappable.

### 4. Containers size bottom-up

A container's size is its children's bounding box plus padding plus header.
This is a post-order tree walk: size all children, then size the parent.
`gridLayout` does this exactly; `tidyLayout` does it for the family-A engines.
An engine that seeds containers with a guessed minimum (as `elkLayout`
currently does) gives a weaker fit and is the likely cause of children
visually spilling their parent.

### 5. Two-pass settle for measured input

`nodeSizes` and `edges[].label` are measured from rendered DOM via
`ResizeObserver`. But rendering needs a position, and position needs the size —
a cycle. It is broken the same way every frame:

1. First pass runs with estimated sizes (default size, or
   `text.length × charWidth` for labels).
2. `ResizeObserver` reports true sizes into a rect registry.
3. A stability guard (≥1px change) re-runs layout with corrected sizes.

The guard prevents thrash during the initial measurement burst. The first
painted frame is pre-correction; this is expected.

## Current State and Convergence

Two engine families exist today with **incompatible signatures**:

| Family | Engines | Input | Output |
|---|---|---|---|
| A (flat) | `treeLayout`, `forceDirectedLayout`, `dagLayout`, `compositeLayout`, `tidyLayout` | `LayoutNode[]` / `TidyNode[]` + `LayoutEdge[]` | `Map<id,{x,y}>` |
| B (tree) | `gridLayout`, `elkLayout` | `{ rootIds, childrenOf, sizeOf, edges, headerHeights }` | `{ positions, sizes }` |

`client-next` (`PgCanvasView`) uses only family B. Family A is documented in
`03-layout-primitives.md` but is not on the active path. `LayoutRequest` /
`LayoutResult` above is family B, generalized — converging the two is the
intended direction:

- Rename family-B input interfaces (`GridLayoutInput`, `ElkLayoutInput`) to the
  shared `LayoutRequest`; rename `sizeOf` → `nodeSizes`.
- Rename family-B output (`GridLayoutOutput`, `ElkLayoutOutput`) to
  `LayoutResult`.
- Add `label?: { w, h }` to the request's edge entries.
- Family-A engines either adopt the contract or are retired if no view needs
  them.

## Edge Labels in Layout

Engines that route edges must reserve space for labels, or labels overpaint
nodes and each other. The producer measures each label and passes its size in
`edges[].label`. The engine reserves a channel.

For `elkLayout` specifically, ELK accepts a `labels` array on each edge object;
the request's `label` maps to it directly, and the root layout options should
set `elk.spacing.edgeLabel`, `elk.spacing.edgeNode`, and `elk.spacing.edgeEdge`
so labels get their own routing room.

Truncated labels (see the edge-label reveal design) have small, stable widths —
they put far less pressure on layout than full-text widths. Shipping label
truncation first makes the `label.w` fed here predictable.

## Boundary Summary

| Concern | Owner |
|---|---|
| What a node means (`kind`, `props`) | producer (client-next) |
| Measuring rendered content size | producer |
| Deriving `childrenOf` from edges | producer |
| Filtering which edges participate | producer |
| Suggesting node positions | engine (cactus) |
| Sizing containers around children | engine |
| Routing edges and reserving label space | engine |

Cactus receives structure and sizes; it returns coordinates. It never reads a
schema, never touches the DOM, never persists. That is the whole contract.
