---
title: Canvas component tree
summary: What lives inside the canvas — toolbars, view switcher, layer toolbar, context menus — derived from inventories of state, mutation rate, and ownership boundary.
tags: [canvas, chrome, component-tree, boundaries]
deps: [doc02.13, doc02.14, doc02.17]
---

# Canvas component tree

## Intent

The app-shell component tree ([doc02.13](13-app-shell-component-tree.md)) stops at `CanvasHost` and declares the canvas internals out of scope. This document picks up exactly there: it derives what lives inside the canvas — chrome, viewport, decoration layers, context menus — and names the ownership boundary that lets cactus paint chrome on the host's behalf.

The derivation procedure is the same one used for the app shell: walk six inventories, let the tree fall out. The conclusion is a three-layer split that mirrors the existing node/edge story.

## The ownership rule

Three layers, three responsibilities. Stated once here, applied everywhere below.

| Layer | Owns | Does not own |
|---|---|---|
| **Pack** | Data: kinds, edges, views, layers, renderers, optional named queries | Anything visual outside a node body |
| **Luminous** (`@luminous/core` + `client-next`) | Translating pack data + current state into chrome schemas; dispatching action events into app state | Painting chrome pixels |
| **Cactus** | Painting the viewport, painting chrome from schemas, hit-testing, screen-space anchoring | Knowing what kinds, views, or layers mean |

The same asymmetry that makes nodes work (pack declares JSON, Luminous interprets, cactus paints geometry) makes chrome work (Luminous declares schemas, cactus paints chrome). Cactus stays domain-agnostic; the host stays free of pixel concerns.

## The six inventories

### 1. State shape

State a canvas reads or mutates:

| Field | Type | Mutation rate | Reader regions |
|---|---|---|---|
| `graph` | `Graph` | Once per mount (re-mount on doc change) | Viewport, ViewSwitcher, LayerToolbar |
| `activeViewId` | `string` | On view switch (rare, user-driven) | ViewSwitcher (selected state), Viewport |
| `enabledLayers` | `Record<LayerId, boolean>` | On layer toggle (occasional) | LayerToolbar (toggle state), Viewport |
| `algorithm` | `'grid' \| 'elk' \| ...` | On algorithm switch (rare) | LayoutToolbar, Viewport |
| `nodeOverrides` | `Map<NodeId, { x, y }>` | On node drag (high, gesture-driven) | Viewport |
| `transform` | `{ x, y, k }` | Continuous during pan/zoom | Viewport, MiniMap (future) |
| `selection` | `Set<NodeId>` | On click, drag-select | Viewport, ContextMenu, ActionBar (future) |
| `inspectorTargetId` | `string \| null` | On node right-click / Esc | InspectorPanel |
| `level` | `DisclosureLevel` | Derived from `transform.k` | Viewport (renderer selection) |

### 2. Action catalog

Every user-initiated mutation to canvas state, named once. The id strings become the action ids in the chrome schema.

| Event id | Trigger | Surfacing region | Payload | Guards |
|---|---|---|---|---|
| `SET_VIEW` | click view tab | ViewSwitcher | `{ viewId }` | `viewId` in `pack.views` |
| `TOGGLE_LAYER` | click layer toggle | LayerToolbar | `{ layerId }` | `layerId` in active view's `layers` |
| `SET_ALGORITHM` | click algorithm radio | LayoutToolbar | `{ algorithm }` | algorithm registered |
| `ZOOM_IN` / `ZOOM_OUT` | click +/- | LayoutToolbar | — | always legal |
| `FIT_VIEW` | click Fit | LayoutToolbar | — | at least one node rendered |
| `INSPECT_NODE` | right-click node | per-node context menu / direct | `{ nodeId }` | node exists |
| `CLEAR_SELECTION` | Esc, click background | viewport-level | — | selection non-empty |
| `DRAG_NODE_START` / `DRAG_NODE` / `DRAG_NODE_END` | pointer on drag handle | NodeContainer | `{ nodeId, dx, dy }` | leftbutton |
| `OPEN_NODE_MENU` | right-click node | per-node context menu | `{ nodeId, screenCoords }` | node exists |
| `OPEN_BACKGROUND_MENU` | right-click background | background context menu | `{ screenCoords }` | always legal |

### 3. Mutation-rate map

Where state changes how often. This drives whether a reader gets its own region or folds into a parent's.

| Rate | Sources | Implication |
|---|---|---|
| Very high (sub-frame) | `transform`, drag deltas | Lives in the viewport's render path; never touches chrome |
| High (per gesture frame) | `nodeOverrides` during drag | Viewport-local; chrome is unaware |
| Occasional (user click) | `activeViewId`, `enabledLayers`, `algorithm`, `selection` | Chrome regenerates from schema producer; cheap |
| Rare (once per mount) | `graph` shape | Whole-canvas remount on doc change is acceptable |

**Implication for chrome.** Chrome only reacts to occasional-rate state. The schema producer is a Solid `createMemo` over `(graph, activeViewId, enabledLayers, algorithm, selection)`. Re-derivation cost is negligible. No need to optimize.

### 4. Read sets

Who reads what:

| Region | Reads |
|---|---|
| ViewSwitcher | `graph.packs`, `activeViewId` |
| LayerToolbar | active view's `layers`, `enabledLayers` |
| LayoutToolbar | `algorithm` |
| Viewport / EdgeLayer | everything except chrome state |
| ContextMenu (node) | node kind, selection membership |
| ContextMenu (background) | empty selection, viewport coords |
| InspectorPanel | `inspectorTargetId`, node content |

The chrome regions read disjoint slices of state; no shared sub-region exists between them. They are siblings, not nested.

### 5. Affordance rules

Where each affordance must live to be legible:

| Affordance | Anchor | Why |
|---|---|---|
| View switcher | Screen-space top-left (or top-center) | Persistent context; always visible across pan/zoom |
| Layer toolbar | Screen-space top-left, adjacent to view switcher | Scopes a layer set to the active view |
| Layout/zoom toolbar | Screen-space top-right or bottom-right | Conventional placement; small, dense |
| Per-node context menu | Cursor-anchored at right-click | Connects intent to target |
| Background context menu | Cursor-anchored at right-click | Same |
| Inspector panel | Screen-space right edge, full height | Conventional editor-IDE pattern; allows comparing alongside viewport |
| Drag handles | Per-node, attached to node geometry | Lives in canvas space; pans and zooms with the node |
| Selection rings, pin badges | Per-node decoration above renderer | Same — canvas space |

Screen-space anchors must resist pan and zoom. Canvas-space anchors must move with them. The split is exactly the difference between chrome (screen) and decoration (canvas).

### 6. Orthogonal regions

Mutually independent zones — a change in one does not force a re-render in another:

- **Chrome** (top, left, right, bottom slots, context-menu layer) — screen-space; orthogonal to viewport.
- **Viewport** (panned/zoomed inner div with nodes and edges) — canvas-space; orthogonal to chrome.
- **Decorations** (selection rings, pin badges, query highlights) — canvas-space, layered above nodes; orthogonal to renderer JSON content.
- **Inspector panel** — screen-space, opt-in, modal-adjacent; orthogonal to chrome.

These four can be implemented and tested independently.

## The derived tree

The inventories collapse into:

```
CanvasHost (host component, owns canvas-state signals)
├── <Canvas> (cactus, owns viewport + chrome rendering)
│   ├── Chrome (cactus, renders ChromeSchema)
│   │   ├── ChromeSlot "top"    ← ViewSwitcher schema, LayerToolbar schema
│   │   ├── ChromeSlot "right"  ← LayoutToolbar schema
│   │   ├── ChromeSlot "bottom" ← (status bar, future)
│   │   ├── ChromeSlot "left"   ← (palette / outline, future)
│   │   └── ContextMenuLayer    ← schema produced on right-click
│   ├── Background (DotGrid)
│   ├── Viewport (panned/zoomed group)
│   │   ├── Nodes (host renders, cactus mounts NodeContainer per node)
│   │   │   └── Decorations: drag handle, selection ring, pin badge, layer dim
│   │   └── EdgeLayer (cactus, renders EdgeDeclaration[])
│   └── BoxSelect overlay
└── InspectorPanel (host, Portal to document.body)
```

The contrast with today's tree is the chrome row. Today, the host renders `<ViewSwitcher/>`, `<LayerToolbar/>`, `<LayoutToolbar/>` as siblings of `<Canvas>`. After this change, those components vanish; the host instead derives a `ChromeSchema` from pack data + current state and passes it to `<Canvas chrome=…>`. Cactus paints the chrome inside its own slot regions.

## Boundary contract — restated

Three contracts, locked:

**Pack → Luminous.** Packs export `views` and `layers` (and other data) shaped exactly as today. No `chrome` field on packs. Pack JSON does not know that chrome exists.

**Luminous → cactus.** Luminous exports schema producers in `@luminous/core`:

- `viewSwitcherSchema(views, activeViewId, dispatch)` → `ToolbarSchema`
- `layerToolbarSchema(activeView, enabledLayers, dispatch)` → `ToolbarSchema`
- `layoutToolbarSchema(algorithm, capabilities, dispatch)` → `ToolbarSchema`
- `nodeContextMenuSchema(node, selection, dispatch)` → `MenuSchema`
- `backgroundContextMenuSchema(dispatch)` → `MenuSchema`

`client-next` composes these into one `ChromeSchema` per render and hands it to `<Canvas chrome=schema onAction=dispatch>`. The dispatch function routes action ids back into Solid signals.

**Cactus → world.** Cactus exports:

- `ChromeSchema`, `ToolbarSchema`, `MenuSchema`, `Action`, `MenuItem` types
- `<Canvas chrome={…} onAction={…} nodeContextMenu={(id) => MenuSchema}>` props
- Chrome primitives (`ToolbarButton`, `ToggleGroup`, `Menu`, `MenuItem`, `Submenu`, `Divider`) built on Kobalte for accessibility

Cactus never inspects schema content. It interprets the schema types literally and dispatches `onAction(id, payload)` on activation.

## Why predicates are not strings

The renderer-engine uses string-eval (`"content.reads.length > 0"`) because it crosses a JSON boundary — pack authors write data files, not TypeScript. Chrome lives on the *Luminous* side of the contract; schema producers are TypeScript functions. Predicates can be plain functions (`enabledWhen: () => selection().size > 0`), or — better — the producer simply omits actions that don't apply. Reactive Solid signals make this idiomatic and free.

A string DSL (`when`-clauses, VS Code style) is the right answer if pack-authored chrome ever becomes a thing. It is not the right answer today, and adding it speculatively buys complexity for no value.

## What this does not cover

- **Schema field-by-field reference.** That belongs in [doc02.20](20-chrome-schema.md).
- **Drag, pan, zoom mechanics.** Already in cactus; the chrome change does not touch them.
- **Inspector panel design.** Continues to be a host concern outside the chrome surface.
- **Multi-canvas / portals.** Future, separate document.

## The discipline, in one sentence

**Packs declare data; Luminous shapes data into chrome schemas; cactus paints chrome.**

Same three-layer asymmetry as nodes and edges, applied to the screen-space surface around them.
