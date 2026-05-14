---
title: Projection and identity
summary: Node identity persists across projections; decoration layers above projection; contain-per-view; animation between views falls out of identity stability.
tags: [projection, identity, view, animation, decoration]
deps: [doc02.11, doc02.14]
---

# Projection and identity

A property graph contains nodes and edges. A view defines how to *see* the graph — which kinds are spatial, which edges play which role, which layout algorithm runs. Switching views does not load new data; it re-projects the same data through a different recipe.

This document names the principles that make multi-view, decoration, and animation cohere as one model rather than three independent features.

## Identity is bedrock

A node has stable identity. The same `id` survives every view switch, every projection, every layer toggle. A node is not "the card you see in the component-tree view" — that is its *appearance under one projection*. The node is the id and its content; appearances are derived.

This is the architectural commitment that everything else depends on. Three downstream features all collapse into trivial consequences if identity is preserved, and into intractable problems if it is not:

- **Tagging** — a user pins a node in one view; the pin persists when the user switches views. Pins key on node id; projection does not alter id.
- **Query highlights** — a user runs "find all components consuming AuthContext"; the matching set highlights. Switching views preserves the highlight set because the set is a list of ids.
- **View-transition animation** — moving a node smoothly from its component-tree position to its data-flow position requires that the engine recognize the two positions as belonging to the same node. Identity makes that recognition free.

The architectural rule that follows: **the projection engine produces a `ProjectedNode` that wraps the original node with view-specific role and position; it does not replace it.** The original node — its id, its content — remains identical across projections.

## Projection is a function

The projection engine consumes:

- The property graph (nodes, edges, both with `kind` and `content`)
- An active view (role assignment per kind, layout algorithm, layer settings)
- Active layer toggles (subset of edge kinds visible / dimmed / hidden)

It produces:

- A set of **spatial nodes** with positions and sizes
- A set of **latent nodes** with reference ids but no spatial presence (rendered only as chips on summary-role edges)
- A set of **arrow edges** with source and target node ids
- A set of **summary edges** that collapse to chips on their source node
- A **containment tree** — the parent/child relationship derived from whichever edge kind plays `contain` in the active view

Projection is a pure function. Given the same `(graph, view, layers)`, the engine produces the same projection. This is what makes animation, caching, and time-travel coherent.

## Contain-per-view

A view assigns one role from `{contain, arrow, summary, hidden}` to each edge kind. The kind that plays `contain` in this view becomes the parenting relation — a node is rendered inside its parent because some edge of the contain-role kind points from child to parent.

The crucial property: **different views can pick different contain-role edges**, and the nesting hierarchy changes accordingly. In the RTP statechart view, `substate-of` plays `contain` and states nest inside composite states. In the RTP concept-map view, `belongs-to-concept` plays `contain` and actions nest inside concepts. Same data, different containment.

A property graph supports this because it does not commit to one nesting up front. A tree commits to one nesting and forecloses the others. Luminous chose property graph specifically to keep the choice open per view.

## Decoration layers above projection

Selection, pins, query matches, and layer dimming are **decorations**. They are not part of the projection. They apply *over* whatever the projection produces.

The engine maintains a small decoration registry per node id:

| Decoration | Source | Effect |
|---|---|---|
| Selection | App state (single or multi-select) | Selection ring around the node |
| Pin | User-state sidecar (persisted) or app state (transient) | Pin badge in a corner |
| Tag | User-state sidecar | Named color marker on the node frame |
| Query match | Active query result | Dim non-matches, glow matches |
| Layer dim | Inactive layer including this node's kind | Reduced opacity |

Decorations layer above the renderer engine's output. The renderer JSON does not author "draw a selection ring when selected"; the engine handles that uniformly across all kinds.

This separation matches CSS: the document does not know it is hovered; the stylesheet adds `:hover` styling. Same idiom, applied to node rendering: the renderer does not know it is selected; the engine adds the ring.

## Tags and query results

Two flavors of user-state that decorate nodes:

**Pins (persistent).** A user marks a node with a named color or label. Written to a `user-state.json` sidecar that travels next to the graph file. Survives reloads. Per-user. Optional.

**Query highlights (transient).** A user runs a named query (see [doc02.14](14-pack-contract.md) `namedQueries`) or composes an ad-hoc filter. The result is a set of node ids. The set persists in app state across view switches; the visual treatment (dim/glow) applies as a decoration. New view, same highlights.

Both treatments survive view switches because both key on node id, and node id is bedrock.

## Animation between views

Switching views runs the projection engine again with a different view spec. Positions, sizes, parent assignments, and visibility roles change. The engine animates the transition by tweening between the old and new projections, keyed by node id.

The technique is FLIP (First, Last, Invert, Play):

1. Before the view switch, the engine records each currently-spatial node's world-space position and size.
2. The view switch applies; projection re-runs; new positions and sizes are computed.
3. The engine tweens each surviving node from its old position to its new position using CSS `transform` transitions.
4. Nodes that change visibility class — spatial in old view, latent in new view, or vice versa — cross-fade between their card and chip representations.
5. Nodes that join the spatial set fade in at their new position; nodes that leave fade out at their old position.
6. Edges re-derive their geometry from node positions at each frame. A mid-tween node at position `p(t)` has an edge endpoint at `p(t)`. Edge animation is free.

Two preconditions:

- The renderer engine reconciles DOM by node id (Solid keyed `<For>` with `key={n => n.id}`). Without this, view switches re-mount nodes and the tween source is lost.
- Layout algorithms are deterministic for a given input. ELK is deterministic; force-directed is not. Animation works cleanly to and from ELK-laid views; force-directed views animate-in but not-out without additional work.

### Re-parenting

A view change can move a node from one parent to another in the containment tree. The DOM hierarchy at rest is parent-as-container, child-inside-container. Mid-animation, the engine renders all spatial nodes in a flat overlay at world-space positions, tweens within the overlay, and re-attaches to the new DOM hierarchy on completion. The transition is invisible because positions match at attach time.

This is the standard layout-animation pattern; the property-graph design does not impose any additional difficulty.

## What this implies for renderer JSON

Renderer JSON is **content-only**. It describes how the node's data renders. It does not describe selection rings, pin badges, layer dimming, or query highlights. Those decorations come from the engine.

The same renderer JSON works in all of:

- Statechart view, spatial
- Concept-map view, latent (rendered only as a chip via a summary edge)
- Selected, pinned, dimmed, matching the active query — all at once

The engine layers decorations on top; the renderer JSON does not bend itself to anticipate them.

## The query bar

ViewSwitcher chooses *which projection*. LayerToolbar tunes *which edges and which diagnostic layers* within a projection. Neither lets a user say "show me only functions in module X" or "show me effects depending on a specific signal."

That third axis is **query**. A pack declares named queries; a user runs them; the result is a set of node ids that decorates the current projection as a highlight set. The toolbar surfacing this is the QueryBar — the natural sequel to ViewSwitcher and LayerToolbar.

QueryBar shares all the infrastructure: queries return node ids, ids decorate via the same mechanism as pins and selection, decoration survives view switches because identity is bedrock. The feature is not a new system — it is the same projection-plus-decoration mechanism with one new input source.

## The discipline, in one sentence

**Identity is bedrock; projection is a function over identity; decoration is a layer above projection.**

Every interaction worth having — tags, queries, animations, multi-view, time-travel — follows from those three commitments. Violating any of them forecloses several features at once. Holding all three keeps the design space open.
