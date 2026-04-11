---
title: Edge Schemas
summary: Edge schema system — discriminated union, layoutRole, connection constraints, declarative routing (exitSide/enterSide), ancestor edge suppression, and the runtime filter pattern
tags: [edges, schemas, design, cactus-boundary]
deps: [doc01.03.03, doc01.02.05.01, doc01.02.06.02, doc01.02.07]
---

# Edge Schemas

Edges in Luminous are freeform by default — any node to any node, optional label. Edge schemas let a canvas declare semantics: direction, layout participation, visual style, and connection constraints. The schema is opt-in: an edge with no `schemaName` still works and renders with the default freeform style.

## The `EdgeSchema` Shape

From `packages/server-next/src/types.ts`:

```ts
export interface EdgeSchema {
  /** Discriminant. Required to distinguish from NodeSchema. */
  kind: 'edge'
  /** Key into the document's schemas table; edges reference this via schemaName. */
  name: string
  /** Human-readable label, used in UI. */
  label: string
  /** Whether the edge is directed. Default false. */
  directed?: boolean
  /** If 'tree', this edge participates in layered tree layout. */
  layoutRole?: 'tree' | null
  /** Visual style; rendering is deferred. */
  style?: EdgeStyle
  /** Node schemaNames legal at fromId (UI hint only, not enforced). */
  acceptsSource?: string[]
  /** Node schemaNames legal at toId (UI hint only, not enforced). */
  acceptsTarget?: string[]
}
```

**Field notes:**

- `kind: 'edge'` — required discriminant distinguishing this from `NodeSchema`. See doc01.02.06.02 for the ADR.
- `name`, `label` — identity and display. `name` is the registry key; `label` is shown in UI.
- `directed` — whether `fromId`/`toId` carry meaningful semantics. Freeform edges are undirected; tree edges are directed (parent → child).
- `layoutRole: 'tree'` — declares that edges of this schema participate in layered tree layout. Currently the only legal value is `'tree'`; the field is a string (not a boolean) to allow future values without breaking changes. `null` or absent means the edge does not drive layout.
- `style` — visual declaration (stroke color, width, dash pattern, arrowhead style). **This field is currently reserved — it's in the type but not yet wired into any renderer.** Styling falls back to defaults for all edge schemas. This is a known gap.
- `acceptsSource`, `acceptsTarget` — UI hints listing node schema names that can legally connect at each end. Not enforced by storage (constraints are best-effort; see "Durability" below).

## The Runtime Filter Pattern

Cactus does not interpret edge schemas. When the runtime wants to lay out a subset of edges (e.g., only tree edges), it pre-filters the edge list before passing it to `compositeLayout` or `treeLayout`. The filter lives in the runtime (client-next), not in cactus:

```ts
// In the runtime (client-next), not in cactus
const treeEdges = doc.edges.filter(e => {
  const schema = doc.schemas[e.schemaName ?? '']
  return schema?.kind === 'edge' && schema.layoutRole === 'tree'
})
compositeLayout(nodes, treeEdges)  // cactus receives pre-filtered edges
```

Cactus never sees the literal strings `'tree'` or `'renders'`. It receives an edge list and treats every edge in that list as participating in the layout. Filtering is a runtime concern; geometric algorithms are cactus's concern. This is the boundary between domain layer and engine.

See doc01.02.05.01 for the full data contract cactus reads, and doc01.02.05.03 for the layout algorithms.

## The Four Reactive-Data Edge Schemas

The Solid.js pipeline (`scripts/analyze-solidjs.ts`) declares four edge schemas for reactive data flow:

- **`cross-component-read`** — a signal created in one component, read in a different component. Represents cross-boundary reactive dependency.
- **`store-access`** — a read from a named Solid store. Indicates where global reactive state is consumed.
- **`datasource-read`** — a read from an external data source (e.g., a fetch call, a WebSocket, an API). Represents the boundary between the reactive graph and the outside world.
- **`effect-dependency`** — a signal read inside a `createEffect` or `createMemo`. Represents reactive subscription that triggers side effects or derived values.

All four carry `kind: 'edge'` and `directed: true`. None set `layoutRole: 'tree'` — they are semantic annotations on the graph, not layout drivers. See doc01.02.07 for the pipeline's classification rules.

A fifth edge schema, **`renders`**, carries `directed: true` and `layoutRole: 'tree'`. It represents component-renders-component relationships detected from JSX usage. This is the only schema that drives the tree layout pass in `compositeLayout`.

## Declarative Edge Routing

Edges support an optional `routing` field that controls how the edge path is drawn:

```ts
export interface EdgeRouting {
  exitSide: 'top' | 'bottom' | 'left' | 'right'
  enterSide: 'top' | 'bottom' | 'left' | 'right'
}
```

When `routing` is present, the edge renderer computes a reactive orthogonal (right-angle) path: exit from the named side of the source node, jog through a midpoint, enter the named side of the target node. The path recomputes automatically when either node moves — the sides are declarative constraints, not absolute coordinates.

When `routing` is absent, the edge renders as a straight line with automatic border intersection (the original behavior).

The "Route edges (orthogonal)" action in the canvas context menu computes optimal exit/enter sides for all directed edges based on relative node positions and writes the routing field to the document. "Clear edge routing" removes all routing fields, reverting to straight lines.

This design was chosen over imperative waypoint caching because:
- **Reactive**: paths update when nodes move (sides are derived from geometry, not stored coordinates)
- **Declarative**: the document says *how* to route, not *where* — surviving layout changes
- **Cheap**: O(1) per edge per frame (just geometry math from side constraints, no obstacle avoidance)

## Ancestor Edge Suppression

When one edge endpoint is an ancestor of the other in the nesting tree, the edge line is suppressed. Instead, the descendant node renders the edge information inline as a small badge (e.g. `↑ reads CanvasView`). This avoids visual clutter from edges that cross through intermediate containers to reach nested children — the nesting already communicates the containment relationship.

The suppression is a rendering decision only — the edge data is unchanged in the document.

## Durability and Best-Effort Constraints

An edge with `schemaName` referencing a missing schema still loads — it falls back to the freeform edge style. An edge violating `acceptsSource` or `acceptsTarget` still loads. Schema registration failures never block canvas loading. The durability invariant from the data architecture research (doc01.03.03) applies uniformly: storage never rejects a canvas document because a schema constraint is violated. Constraints are best-effort hints for the UI, not structural requirements enforced by the file format.
