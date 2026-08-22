---
title: Overview
summary: The prior-art set for cactus as a canvas library — ten documented peers, the level rule that selects them, and the fixed shape every product doc follows
tags: [cactus, prior-art, overview, canvas, libraries]
deps: [doc02.05.01]
---

# Overview

This section compares cactus to prior art at cactus's own level: **libraries a
developer embeds to build a canvas app**. Products like Figma or Miro sit at
Luminous's level, not here. A product-level entry earns a doc only when its
editor carries interaction vocabulary worth mining, and its doc is flagged
product-level.

The goal is a substrate for comparison. Each product doc records the
product's mental model — its nouns and their relations — and what it lets its
user do. A design question (grouping, undo, ports, selection, layout) is then
answered by reading the same section across all ten docs, without new
research. The product docs themselves stay neutral; comparisons to cactus
live in design docs that cite them.

## The documented set

| Doc | Level | Family | Why it is here |
|-----|-------|--------|----------------|
| React Flow (xyflow) | web library | node-and-edge canvas | the mainstream peer; nodes and edges as host state, custom nodes as components |
| tldraw SDK | web library | freeform whiteboard | shape-store-plus-editor model; best-in-class interaction quality |
| Konva | web library | 2D scene graph | no node/edge semantics — the low-level anchor showing what an engine adds |
| Cytoscape.js | web library | graph visualization | stylesheet mental model; compound (parent/child) nodes as a first-class citizen |
| GoJS | web library (commercial) | diagram engine | richest built-in vocabulary for groups, placeholders, and subgraph collapse |
| LiteGraph.js / ComfyUI | web library | dataflow editor | the most-used dataflow engine in practice, via the ComfyUI fork |
| Qt Graphics View | desktop library | scene graph engine | the hardened desktop peer: scene/view/item split, decades of interaction edge cases |
| Unreal Blueprints | product | node editor | comment boxes, exec pins versus data pins, collapsed subgraphs |
| Blender nodes | product | node editor | frames and node groups — the derived and the owning envelope shipped side by side |
| Houdini networks | product | node editor | network boxes and subnets; the deepest nested-network organization culture |

A convergence worth naming: every mature node editor in this set ships *both*
group forms — an annotative rect whose bounds derive from its members
(Blueprints comment box, Blender frame, Houdini network box) and a collapsing
container that owns its members (Blender node group, Houdini subnet). The two
are policies of one member-set concept, not separate inventions.

## Mentioned, not documented

- **JointJS** — model/view diagram engine (cells + paper); mid-tier adoption, sustained by its commercial edition.
- **maxGraph** — community continuation of mxGraph (archived 2020, the draw.io engine); the lineage matters more than the library.
- **AntV X6** — popular node-and-edge canvas, community and docs largely in the Chinese ecosystem.
- **Rete.js** — node-editor framework with an execution engine; respectable community, thin production use.
- **yFiles for HTML** — commercial enterprise standard for automatic layout and folding.
- **Excalidraw** — embeddable as a component, but effectively a whole app.
- **Fabric.js, PixiJS** — alternative 2D scene graphs / renderers at Konva's level.
- **Sigma.js** — WebGL rendering of large graphs; viewing, not authoring.
- **imgui-node-editor, imnodes** — immediate-mode node canvases from game tooling; a different rendering philosophy.
- **Piccolo2D / Pad++** — the academic zoomable-UI toolkit lineage; where semantic zoom was worked out.
- **Max/MSP, Pure Data** — the patcher paradigm; subpatches, hot/cold inlets. Houdini covers the node-editor slot in the documented set.
- **LabVIEW, Simulink, KNIME** — engineering and data-science node editors; structures/subsystems/metanodes are the owning-group form.
- **ELK, dagre, Graphviz** — layout engines: a dependency category, not a peer. Cactus calls ELK.

## The shape of a product doc

Every product doc has the same four sections, so the same question can be
asked across all ten:

1. **What it is** — one paragraph: level (library or product), platform,
   license, rough adoption.
2. **Mental model** — the product's nouns and their relations, stated in the
   product's own vocabulary as terse purposed terms ("A *Shape* is …").
   This section carries the doc.
3. **Capabilities** — short "the developer can / the user can" statements,
   split by the responsibility boundary: what the library owns versus what
   the host app owns.
4. **Sources** — links to the official docs consulted, with the date and
   product version. Facts likely to go stale (API signatures, option lists)
   live behind the links, not in the doc.

Neutrality rule: a product doc describes, in the product's vocabulary, and
never argues. Judgments — what cactus adopts, rejects, or does differently —
belong in design docs (doc02.05) that cite these docs.
