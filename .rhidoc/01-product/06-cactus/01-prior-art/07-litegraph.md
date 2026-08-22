---
title: LiteGraph.js / ComfyUI
summary: LiteGraph's mental model — an executable graph of typed-slot nodes drawn on one 2D canvas, with LGraphGroup as an annotative capture rectangle — and the upstream/ComfyUI-fork maintenance split
tags: [cactus, prior-art, litegraph, comfyui, dataflow, web-library]
deps: [doc01.06.01.01]
---

# LiteGraph.js / ComfyUI

## What it is

LiteGraph.js is an MIT-licensed JavaScript library for building executable
dataflow node editors — a graph the host can *run*, not only draw. Upstream is
`jagenjo/litegraph.js`: a single dependency-free file that renders on an HTML5
Canvas2D element, ships its own editor, and can execute graphs in the browser
or in Node.js. Upstream is mostly dormant (last release March 2024). The
actively developed line is ComfyUI's fork, published as `@comfyorg/litegraph`
and rewritten in TypeScript; it is largely incompatible with upstream despite
shared API names, and is by far the most-deployed variant through ComfyUI. As
of August 2025 that fork's standalone repository is archived and its source now
lives inside the ComfyUI frontend monorepo, where development continues.

## Mental model

- An **LGraph** is the graph itself and the execution container. It holds the
  nodes and links, and it runs them: `start()` drives stepping, and each
  `runStep()` calls every node's `onExecute` in dependency order (nodes with no
  inputs are level 0, their consumers level 1, and so on). It serializes to a
  plain JSON object (`serialize()`) carrying nodes, links, groups, and config,
  and restores from one (`configure()`).
- An **LGraphNode** is a computational unit. Typed input and output slots are
  declared with `addInput(name, type)` and `addOutput(name, type)`, where a
  type is a string like `"number"` or `"vec3"` (or a wildcard). An input takes
  at most one link; an output may fan out to many. The node's work lives in its
  `onExecute` callback, which reads slots with `getInputData` and writes them
  with `setOutputData`. **Widgets** (sliders, combos, toggles, text, buttons)
  are the node's in-body interactive controls; **properties** (`this.properties`)
  are its editable configuration data. Custom node types are registered with
  `LiteGraph.registerNodeType`.
- A **link** is a typed connection between an output slot of one node and an
  input slot of another. The slot types declared at each end govern what may
  connect; data flows along the link when the graph executes.
- An **LGraphCanvas** is the renderer and interaction surface. One canvas
  element draws everything — every node, link, widget, and group — and handles
  zoom, panning, selection, and editing. Its editor adds a search box, keyboard
  shortcuts, multiple selection, and a context menu.
- A **subgraph** is a node that itself contains a whole graph, letting a network
  nest inside a single node.
- An **LGraphGroup** is a resizable background rectangle drawn behind nodes as
  an annotation. Its bounds are user-set — a rectangle with a title, positioned
  and resized by the user via a corner handle, stored as `[x, y, width, height]`.
  Membership is *derived* from those bounds, not declared: `recomputeInsideNodes`
  fills the group's `_nodes` from whichever nodes fall geometrically inside the
  rectangle. Moving the group moves the captured nodes with it — `move(dx, dy)`
  shifts the group and, by default, every node in `_nodes`; a flag moves the
  rectangle alone. The group owns no execution role; it captures and relocates
  its members without containing them structurally.

## Capabilities

The library owns execution, rendering, and the editor; the host supplies node
behavior and persistence.

The library ships: the execution engine (dependency-ordered stepping through
`onExecute`, browser or Node.js), single-canvas rendering of nodes, links,
widgets, and groups, node registration and a set of built-in nodes (math,
audio, interface widgets, 3D), typed-slot connection, group capture-and-move,
subgraph nesting, JSON serialization and restore, and a built-in editor
(search box, shortcuts, multi-select, context menu). A live mode renders node
output while hiding the graph structure, for building runtime UIs.

The host implements: the custom node types that carry the application's meaning
(each an `LGraphNode` subclass with its slots, widgets, and `onExecute`), plus
storage of the serialized JSON and any application logic around it.

So the user can, out of the box, add and wire nodes, edit them through widgets,
group and move them, run the graph, and save it; what each node *does* is the
host's node code.

## Sources

Consulted 2026-07-14. Upstream `jagenjo/litegraph.js` (last release 0.7.x,
March 2024): the repository README and `guides/README.md` (execution, slots,
widgets, properties, live mode), the `src/litegraph.d.ts` type definitions
(`LGraphNode` slots and callbacks, `LGraph.serialize`/`configure`,
`LGraphGroup` bounds and `move`/`recomputeInsideNodes`), and generated class
docs at tamats.com/projects/litegraph. ComfyUI fork `@comfyorg/litegraph`: the
`Comfy-Org/litegraph.js` repository (archived August 2025; source merged into
`Comfy-Org/ComfyUI_frontend`) and the `@comfyorg/litegraph` npm page. API
signatures and built-in node lists live behind these links and change over
time.
