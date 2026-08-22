---
title: Cytoscape
summary: Cytoscape.js's mental model — the cy instance, elements as JSON in one collection, the selector/stylesheet model, built-in layouts and graph algorithms, and compound nodes whose bounds derive from their children
tags: [cactus, prior-art, cytoscape, graph-visualization, web-library]
deps: [doc01.06.01.01]
---

# Cytoscape

## What it is

Cytoscape.js (v3.34) is an MIT-licensed JavaScript library for graph
analysis and visualization. The same permissive license covers the core
library and all first-party extensions. It runs framework-agnostically in
the browser and in Node, with or without a DOM container (a headless
instance can run graph algorithms without drawing). It carries a strong
standing in bioinformatics and network analysis: it is the browser sibling
of the long-running Cytoscape desktop application, and is widely embedded to
render biological pathways, citation graphs, and other networks. Wrappers
exist for React and for Python (Dash Cytoscape).

## Mental model

- The **`cy` instance** is the graph and the entry point to the library.
  It is created with `cytoscape({ ... })`, optionally given a `container`
  DOM element to draw into, plus `elements`, `style`, and `layout` options.
- An **element** is a node or an edge, and both live in one collection
  model. An element is a plain object with a `group` of `'nodes'` or
  `'edges'`, a `data` object, and (for nodes) a `position` `{x, y}`. The
  `data` object holds a required `id` and any custom fields; an edge's
  `data` also names a `source` and a `target` node id. A node's `position`
  refers to the centre point of its body.
- A **collection** is a set of elements. Collections are immutable by
  default: set-theory operations (union, intersection, difference) and
  filters return new collections rather than changing the set in place.
- The **selector** is a terse, CSS-like query over elements. A selector
  matches by group (`node`, `edge`), by `#id`, by `.class`, and by data
  attribute with bracket notation such as `node[weight > 50]`.
- The **stylesheet** separates presentation from data. It is a list of
  rules, each a `{ selector, style }` pair, applied like CSS: an element
  takes the style of every rule it matches, and a later matching rule
  overrides an earlier one. Style property values may be constants or
  **mappers** — `data(field)` maps one data field straight to a property,
  and `mapData(...)` maps a data range proportionally to a value range.
  The docs discourage per-element style overrides in favor of the
  stylesheet.
- **Graph-theory operations** ship on collections: traversals (breadth-first
  and depth-first search), shortest paths, and centrality and ranking
  algorithms up to PageRank, alongside the set-theory operations above.
- A **layout** positions the nodes. The `cy` instance runs a named layout
  over a collection. Built-in layouts include `preset` (positions supplied
  by the caller), `random`, `grid`, `circle`, `concentric`, `breadthfirst`
  (levelled, tree-like), and `cose` (a force-directed, physics-simulation
  layout). Further layouts ship as extensions — `fcose` (a faster
  force-directed layout that handles compound graphs well), `cola`, `dagre`
  and `klay` (hierarchical), `euler`, and `spread`.
- A **compound node** is a node that contains other nodes. A child sets a
  `parent` field in its `data` naming the parent node's id. A compound
  parent node does not have independent dimensions: its position and size
  are automatically inferred from the positions and dimensions of its
  descendant nodes — the parent's bounds derive from its children rather
  than being owned directly. Grabbing and dragging a parent moves its
  children with it. The parent relationship is immutable through
  `ele.data()` once the node is added; a child is reparented only through
  `eles.move()`.
- The **expand-collapse** extension (a separate first-party extension) adds
  collapsing of compound nodes. Collapsing a parent hides its children and
  draws a cue icon (default plus/minus, top-left) on collapsible nodes;
  `collapseAll()` and `expandAll()` toggle recursively. Edges from a hidden
  child to an outside node become **meta-edges** on the collapsed parent,
  and multiple edges between the same pair can collapse into one.

## Capabilities

The library owns the graph model, styling, layout, analysis, and the base
viewport gestures; the host builds the editing experience on top.

The library ships: the element/collection model, the selector and
stylesheet engine, the built-in layouts and the layout extension interface,
graph-theory and analysis algorithms, compound (parent/child) nodes with
derived bounds, and the base gestures — pan, zoom, box and multi-select, and
grab-and-drag of nodes (`grabbable` per node) on touch and desktop. It also
runs headless for computation with no rendering.

The host implements: the editing UX — adding and removing elements, the
gesture for drawing a new edge between nodes, node creation, and inline
editing — plus persistence and loading, connection rules, context menus, and
undo/redo. Several of these are offered as first-party extensions the host
opts into (for example edge-handles for edge drawing, compound-drag-and-drop
for reparenting by drag, expand-collapse for collapsing, and undo-redo)
rather than built into the core.

So: the user can pan, zoom, select, and drag nodes out of the box, and the
graph can be styled, laid out, and analyzed by the library; authoring
gestures — drawing edges, creating and reparenting nodes, saving — are the
host's code or an opted-in extension.

## Sources

Official docs at js.cytoscape.org, consulted 2026-07-14 at Cytoscape.js
3.34 — principally the front page overview and the sections on
elements-json (nodes, edges, `data`, `position`, `group`), compound-nodes,
collections (set-theory and graph-theory operations, `eles.move()`), style
(selectors, stylesheet rules, `data()`/`mapData()` mappers), and layouts.
First-party extensions referenced: cytoscape.js-expand-collapse and
cytoscape.js-compound-drag-and-drop on github.com/cytoscape and
github.com/iVis-at-Bilkent. The layout survey draws on
blog.js.cytoscape.org/2020/05/11/layouts. API signatures, the full option
lists, and the extension registry live behind those links and change over
time.
