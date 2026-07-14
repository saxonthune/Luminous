---
title: Prior art
summary: Canvas and graph-layout libraries placed on a spectrum of user control, and the frame-versus-group distinction cactus adopts for containers and underlay groups
tags: [cactus, prior-art, groups, layout, canvas]
deps: [doc02.05.01, doc02.05.03]
---

# Prior art

Cactus sits among many canvas and graph tools. This doc places them on a
spectrum of user control over layout, and records the one distinction the
group/underlay design borrows: an envelope over a set of nodes either *owns*
its members' positions or *derives* from them.

## Spectrum of user control

**No spatial control — text in, diagram out.** The layout engine owns every
position; the user edits source text.

- Graphviz: `subgraph cluster_*` is the original group-aware layout — a
  cluster is laid out recursively as its own subgraph, then composed into the
  parent as one unit, with a border drawn around the result.
- ELK (Eclipse Layout Kernel, `elkjs`): hierarchical layout is first-class —
  a node may contain a child graph, laid out recursively with padding. Cactus
  already calls `elkLayout` for its top-level pass.
- Mermaid (`subgraph`), D2 (containers), PlantUML: same model, lighter
  engines.

**Automatic layout plus user drag.** The engine proposes, the user adjusts.
This is where cactus sits.

- dagre: layered DAG layout, no cluster support — a long-standing gap that
  forks tried and failed to fill cleanly.
- Cytoscape.js: compound nodes (parent/child) are first-class in the model;
  the fcose layout handles them natively.
- yFiles (commercial): group nodes with folding (collapse a group to one
  node) and incremental layout that preserves the user's mental map.
- GoJS (commercial): a `Group` is a node whose visual contains a
  `Placeholder` — a rect whose bounds are *computed from the members plus
  padding*. Members stay in the canvas's layers; the group merely paints
  behind them. A group may also carry its own layout that arranges its
  members. This is the closest prior art to the cactus underlay design: one
  member-set concept serving both a derived visual envelope and a layout
  scope.
- JointJS: embedding (parent/child cells) with manual or plugin layout.

**User-owned layout.** The user places everything; the engine only assists.

- React Flow: subflows — a child node declares `parentId` and moves with the
  parent; `extent: 'parent'` clamps it inside. The parent owns the frame; the
  child is positioned relative to it. A pure owning-envelope model.
- Figma: makes the two envelope policies explicit as two features. A *frame*
  owns its bounds — children are positioned relative to it and clip to it. A
  *group*'s bounds are derived — they recompute from the members whenever a
  member moves or resizes. Same visual (a rect around things), opposite
  dependency direction.
- tldraw (frames), Excalidraw (groups as selection bindings, frames as
  containers), Miro/FigJam (frames): variations on the same split.

## The distinction cactus adopts

An envelope over a member set has one of two policies:

- **Owning envelope** — the envelope positions its members; member
  coordinates are relative to it. In cactus this is the existing container
  (`parentId` nesting, `gridLayout` child policies, `softContainer` tint).
- **Derived envelope** — the members position the envelope; its bounds are
  `computeBounds(memberRects) + padding`, recomputed reactively. This is the
  underlay group (Figma's group, GoJS's placeholder).

The two share the member-set concept, the bounds math (`computeBounds`), the
tint visual, and the ambition to scope a layout to the set. They differ only
in which side owns position. Prior art that treats them as one concept with
two policies (GoJS, Figma) ages better than prior art that builds two
unrelated features.

## Group-aware layered layout

Every engine that lays out groups in a DAG does it the same way: treat the
group as a synthetic container — lay out its members as a subgraph, compose
the resulting box into the parent level as one rankable unit (Graphviz
clusters, ELK hierarchy). Edges crossing the group boundary constrain the
group box's rank, not the individual member. `dagLayout` already has the
recursive machinery (`parentId` nesting, edge lifting to nearest non-shared
ancestors); group support means synthesizing a container per group before the
recursion and discarding it after. This requires groups to nest cleanly —
each node in at most one group, groups not spanning containment boundaries —
which a scalar per-node group label guarantees by construction.
