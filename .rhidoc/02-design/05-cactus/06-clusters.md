---
title: Clusters
summary: The cluster — cactus's envelope over a member set — its declaration API, the laminar and annotation tiers, and how nesting decomposes into cluster plus coordinate ownership
tags: [cactus, clusters, groups, layout, underlay]
deps: [doc02.05.01, doc02.05.03, doc01.06.01.01, doc02.21.01]
---

# Clusters

A **cluster** is cactus's envelope over a member set: a set of node ids that
share a visual envelope (a tinted rect computed behind them), a label, and —
when the set is laminar — unit treatment in layout. "Cluster" is the
layout literature's word (Graphviz clusters, ELK hierarchy); it is a
geometric instruction, not a domain concept. Hosts decide what a member set
means; cactus sees node ids.

## Nesting decomposes into cluster + coordinate ownership

Containment in Luminous Canvas is a view-time projection of edges:
`evaluateContainment` (core `graph.ts`) derives the tree per view from
`contain`-role edges, and v3 nodes carry no parent field. Rendering is flat —
children are absolute-positioned siblings, and each container paints its own
envelope (`softContainer`). So a rendered container is already: a member set,
an envelope, a label, unit layout. What nesting adds is **coordinate
ownership**: parent-relative positions, child layout policies, drop-target
gestures.

The decomposition: **nest = cluster + coordinate frame.** Clustering is the
weaker projection; nesting implies it. A view's presentation ladder for a
relation is: hidden → drawn edge → cluster → nest.

Two orthogonal facts, kept separate in the engine:

- **Coordinate parenting** (`parentId` in layout inputs,
  `resolveAbsolutePositionByParentOf`): who owns a node's coordinate frame.
  A single tree, enforced. Unchanged by this design.
- **Cluster membership**: which set a node belongs to for envelope, label,
  and unit layout. Never owns coordinates, never enters `ContainmentTree`,
  and flows through its own evaluator and render channel.

The separation is load-bearing: every containment consumer (`composeLayout`,
`bfsOrder` paint order, `deepLodMeasure`, `fitView`, `sectionColorOf`)
assumes a single spanning tree, and `evaluateContainment` throws on a second
contain kind. Clusters that rode the containment pipeline would break it;
clusters in a separate channel touch none of it.

## Declaration API

Clusters follow the edge pattern: declared on `Canvas`, not rendered by the
host.

```ts
// on <Canvas>, sibling to edges
clusters?: ClusterDeclaration[]

interface ClusterDeclaration {
  id: string
  memberIds: string[]
  label?: string            // drawn at a corner of the envelope
  tint?: string             // defaults to the container tint token
}
```

Rendering: a dedicated underlay layer in `Canvas` between the background and
the edge SVG, sharing the viewport transform. Each cluster's rect is a
`createMemo` over the reactive node-rect registry (`getNodeRects()` — the
same source edges subscribe to) filtered to `memberIds`, through
`computeBounds` with padding. Bounds are **derived**: members position the
envelope, live during drag. The rect is click-through (`pointer-events:
none`); the underlay never steals node, pan, or selection gestures.

Interaction callbacks (`onLabelEdit`, `onDragBy` — the label as a set-drag
handle) extend the declaration when a host wires editing; the label is then
the only interactive element. The first consumers render passively.

## Layout: `clusterId`

`TidyNode` gains `clusterId?: string`. Siblings sharing a `clusterId` are
laid out contiguously and rank as one unit in `dagLayout` — implemented
internally by synthesizing a container per cluster before the recursion and
resolving it away after. The existing recursion and edge lifting do the
work: an edge crossing the cluster boundary constrains the cluster's rank,
not the member. This is how Graphviz and ELK lay out groups.

## Two tiers

- **Laminar clusters** (layout-affecting): each node in at most one cluster,
  clusters not straddling containment boundaries. Required by the
  synthetic-container mechanism. A scalar per-node label guarantees it by
  construction.
- **Annotation-only clusters** (paint and label, no layout influence): may
  overlap freely — they touch nothing tree-shaped.

A declaration is annotation-only unless the host also passes `clusterId` to
the layout call. The two tiers are the same declaration; the host chooses
per relation.

## How each app projects onto clusters

| | Relation source | Projection | Cactus sees |
|---|---|---|---|
| Dataflow Group | `box.group` field (doc02.21.01) | cluster: derived bounds, corner label | memberIds + clusterId |
| Canvas nesting | `contain`-role edges, per view | nest: envelope + coordinate frame | parentId (today's pipeline) |
| Canvas grouping | `cluster`-role edges, per view | cluster, annotation-only first | memberIds |

**Dataflow**: the group name is the cluster id and label; membership is every
Box carrying that name. Explicit membership with derived bounds — the
combination the prior-art survey (doc01.06.01) found in data-model-first
tools.

**Canvas**: `EdgeRole` gains `'cluster'`. A cluster-role edge points from a
member node to a hub node; the hub node's identity names the cluster and
supplies its label. This is the same graph shape as containment (edge from
child to parent) with a weaker role — the ladder made concrete. The hub is an
ordinary node; a view chooses whether it also renders spatially. Cluster
evaluation is a separate evaluator from `evaluateContainment`, with no tree
constraints: multiple cluster kinds and overlapping membership are allowed
because Canvas clusters start annotation-only.

## Adoption path

1. cactus: underlay layer, `ClusterDeclaration`, `clusterId` in `dagLayout`.
   Additive.
2. Dataflow: `group?: string` through core, schema, MCP, and projection;
   passive rendering.
3. Canvas: the `'cluster'` edge role and projection plumbing, annotation-only,
   mirroring the `edgeDeclarations` path. A pack-vocabulary addition — the
   luminous-pipeline skill updates in the same change.
4. Convergence, when forces demand: container envelopes re-expressed as
   clusters over `childrenOf` (retiring `softContainer`), which requires
   deciding a coloring policy — `sectionColorOf` assumes one root ancestor
   per node — and gives containers set-drag for free.

## Known debts this design touches

- `computeAttach` / `computeDetach` / `findContainerAt` have no callers and
  assume a `parentId` node field the edge-based model rejected. They are
  deleted, and rewritten against contain-edges when nest gestures gain a
  write path (Canvas has no graph mutation from the UI today).
- A member moved by hand and a relayout disagree; the layout's answer wins
  today. Which wins is an app-level decision (doc01.05.04 R6 makes dragging
  a Dataflow capability).
