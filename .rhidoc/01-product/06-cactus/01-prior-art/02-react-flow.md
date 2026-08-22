---
title: React Flow
summary: React Flow's mental model — nodes and edges as host-owned state, change objects, handles, subflows — and the library/host responsibility split
tags: [cactus, prior-art, react-flow, node-and-edge, web-library]
deps: [doc01.06.01.01]
---

# React Flow

## What it is

React Flow (`@xyflow/react`, v12) is an MIT-licensed React library for
node-based UIs — the mainstream web peer. The xyflow monorepo also ships
Svelte Flow and a shared framework-agnostic core (`@xyflow/system`); state is
Zustand internally. Development is funded by a Pro subscription whose product
is *example code*, not library features (see Capabilities). Named commercial
users include Stripe, LinkedIn, Zapier, and Railway.

## Mental model

- A **Node** is a plain object `{id, position, data, type?}` in the host's
  state. `data` is opaque custom data handed to the node's component. `type`
  selects a React component from a host-supplied `nodeTypes` registry — a
  custom node renders anything.
- A node's rendered size is measured by the library into a read-only
  `measured: {width, height}`; the host does not set dimensions directly.
- An **Edge** is a plain object naming `source` and `target` node ids,
  rendered as a styleable SVG path. Four built-in path types (bezier,
  smoothstep, step, straight); custom edges via an `edgeTypes` registry.
- A **Handle** is a component placed inside a custom node marking where
  edges attach — `source` (outgoing) or `target` (incoming); multiple
  handles per node carry ids that edges reference.
- A **Connection** is the gesture of dragging from one handle to another; a
  connection line previews it, `onConnect` reports it, and host-supplied
  `isValidConnection` decides what is allowed.
- The **Viewport** is a transform `{x, y, zoom}` over flow coordinates;
  node positions are in flow coordinates, and instance methods
  (`screenToFlowPosition` and its inverse) convert.
- **Controlled flow** is the recommended state model: the host owns the
  `nodes` and `edges` arrays. Interactions do not mutate — they emit
  **change objects** (`NodeChange`, `EdgeChange`) that the host applies
  (`applyNodeChanges`). The docs compare it to a controlled HTML input. An
  uncontrolled mode exists where the library keeps state internally.
- A **subflow** is the grouping construct, and it is purely the owning
  form: a child node sets `parentId`; its position becomes relative to the
  parent's top-left; dragging the parent moves the children;
  `extent: 'parent'` clamps children inside; `expandParent` grows the parent
  when a child hits its edge. The parent is an ordinary node. There is no
  derived-bounds group (no rect computed from members). Parents must precede
  children in the nodes array.

## Capabilities

The library owns interaction; the host owns state, meaning, and geometry.

The library ships: node drag, pan/zoom (slippy-map defaults, Figma-style via
props), box select and multi-select, handle-to-handle connecting, keyboard
delete, node measurement, selection z-ordering, and plugin components —
Background, MiniMap, Controls, Panel, NodeToolbar, NodeResizer.

The host implements: all state application (every drag ends in the host's
reducer), **layout** — the library has no layout algorithms and its docs
point to dagre, d3-hierarchy, d3-force, and ELK — plus persistence,
connection validation, context menus, and drag-in from outside.

A distinctive tier: features that most editors build in exist here only as
**Pro-gated example code** the host copies — undo/redo, copy/paste, helper
lines, selection-grouping and dynamic parent-child UX, auto-layout,
expand/collapse, edge routing, collaboration.

So: the user can drag, pan, zoom, select, connect, and delete out of the box;
everything those gestures *mean* — and everything about where nodes sit —
is the host's code.

## Sources

Official docs at reactflow.dev, consulted 2026-07-14 at `@xyflow/react`
12.11.2 — principally: learn/concepts (terms-and-definitions,
adding-interactivity, the-viewport, built-in-components),
learn/advanced-use (state-management, uncontrolled-flow),
learn/layouting (layouting, sub-flows), learn/customization
(custom-nodes, custom-edges, handles), api-reference/types/node,
api-reference/components, the examples index, /pro, and
github.com/xyflow/xyflow. API details and the Pro example list live there
and change over time.
