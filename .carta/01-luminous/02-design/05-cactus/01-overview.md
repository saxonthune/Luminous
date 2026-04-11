---
title: Cactus Overview
summary: Architecture of the cactus canvas engine — layers, coordinate systems, DOM conventions, and design principles
tags: [cactus, canvas, engine, architecture, overview]
deps: [doc01.02.01]
---

# Cactus Overview

Cactus is a custom, domain-agnostic canvas engine. It is not React Flow. It uses d3-zoom for viewport control, DOM data-attributes for hit-testing, and composable Solid primitives for interaction. The engine provides primitives; the domain layer above it (in `client-next`) decides what nodes mean, how edges behave, and what gestures do.

**Location:** `packages/cactus/src/`
**Consumer:** `packages/client-next/` (the active Luminous client)

## Data Contract

Cactus is "domain-agnostic" in a precise sense: the boundary is defined by which fields it reads and which it ignores.

**Nodes.** Cactus reads `id`, `schemaName` (as an opaque string tag — never interpreted), `parent` (for containment rendering), and `geometry` (`{x, y, w, h}`). It does not read `content`, does not know what `title`, `body`, or any schema-specific field means, does not interpret `schemaName` values, and does not validate schemas.

**Edges.** Cactus reads `id`, `fromId`, `toId`, and optionally `schemaName` (again as an opaque tag). It does not interpret edge schemas and does not filter edges by schema — filtering is the caller's job. Edge direction is a visual hint for the renderer, not a semantic constraint cactus enforces.

**Schemas.** Cactus reads nothing from `doc.schemas`. The schemas table is entirely the domain layer's concern. Cactus receives opaque `schemaName` strings on nodes and edges and uses them only as data attributes for CSS styling and hit-testing.

If new code in cactus starts reading content, interpreting schema names, or knowing what specific strings like `'component'` or `'renders'` mean, it belongs in the domain layer above cactus, not in cactus itself.

## Design Principles

**Domain-agnostic.** Cactus knows nothing about notes, schemas, or document models. It provides a zoomable canvas with nodes, edges, selection, and connection gestures. The domain layer maps its own concepts onto these primitives.

**Composable primitives.** Each interaction (drag, resize, connect, select) is a standalone primitive with its own state. The `Canvas` component composes them, but they can be used independently. This avoids monolithic state and makes interactions testable in isolation.

**DOM-based hit-testing.** Rather than maintaining a spatial index, cactus uses `document.elementsFromPoint()` and data attributes for hit-testing. This is simpler, naturally respects CSS z-order, and means the DOM is the source of truth for what's clickable.

**Render props for extensibility.** Edges, connection previews, and backgrounds are render props on `Canvas`. The engine renders the structural layers; the domain layer fills in the content.

## Architecture Layers

The canvas renders four DOM layers, stacked with absolute positioning:

```
┌─────────────────────────────────────────┐
│  4. Overlays (box-select rect)          │  Screen coords
├─────────────────────────────────────────┤
│  3. Connection preview SVG              │  Container-local coords
├─────────────────────────────────────────┤
│  2. Edge SVG layer                      │  Canvas coords (via SVG transform)
├─────────────────────────────────────────┤
│  1. Node layer (transformed div)        │  Canvas coords (via CSS transform)
├─────────────────────────────────────────┤
│  0. Background (DotGrid / custom)       │  Pattern coords (zoom-aware)
└─────────────────────────────────────────┘
```

Layers 1 and 2 share the same `translate(x, y) scale(k)` transform, keeping nodes and edges aligned. The connection preview uses container-local pixel coordinates because it mixes a zoom-stable anchor (start point, derived from canvas coords) with a raw cursor position (current point, in screen coords).

## Coordinate Systems

Three coordinate spaces are in play:

| Space | Origin | Used by | Conversion |
|-------|--------|---------|------------|
| **Canvas** | Top-left of infinite canvas | Node positions, edge endpoints, geometry utilities | Zoom-invariant |
| **Screen** | Top-left of browser viewport | Pointer events, cursor tracking | `screenToCanvas(x, y)` |
| **Container-local** | Top-left of Canvas container div | Connection preview, box-select overlay | `screen - containerRect` |

The `screenToCanvas` function (from `useViewport`, returns signal Accessors) handles the screen-to-canvas conversion, accounting for the current pan/zoom transform. The transform object `{ x, y, k }` represents: translate by `(x, y)` pixels, then scale by `k`.

## DOM Attribute Conventions

Cactus uses data attributes for declarative hit-testing and interaction control:

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `data-no-pan` | (presence) | Prevents canvas pan when pointer is over this element. Applied to nodes, handles, and interactive overlays. |
| `data-connection-target` | `"true"` | Marks an element as a valid drop target for connection drags. |
| `data-node-id` | node ID string | Identifies which node a connection target belongs to. |
| `data-handle-id` | handle ID string | Identifies which handle within a node (optional, for port-level connections). |
| `data-drop-target` | `"true"` | Marks an element as a valid drop target for nesting (drag-to-nest). |
| `data-container-id` | container ID string | Identifies which container node a drop target belongs to. |
| `data-drag-handle` | (presence) | Restricts drag initiation to elements with this attribute (when `handleSelector` is set). |

## Viewport Behavior

The viewport is managed by d3-zoom attached to the container div:

- **Wheel**: always zooms (no scroll). Zoom range: 0.15x to 2x.
- **Middle-mouse drag / touch pinch**: pan and zoom.
- **Left-mouse drag on background**: initiates box-select (with Shift) or pans.
- **Left-mouse drag on `data-no-pan` elements**: blocked from pan — the element's own handler (node drag, resize, connection) takes over.

Programmatic control: `fitView(rects)`, `zoomIn()`, `zoomOut()` all animate with a 300ms transition.

## Interaction Model

Each interaction is a hook that follows the same pattern:

1. **Attach** — Returns a pointer-down handler (or ref) to attach to DOM elements.
2. **Track** — On pointer down, registers window-level move/up listeners. Uses `requestAnimationFrame` throttling for smooth updates.
3. **Callback** — Fires domain callbacks (`onDrag`, `onResize`, `onConnect`) with computed deltas or results.
4. **Cleanup** — On pointer up, removes listeners and resets state.

All hooks are zoom-aware: screen-space pointer deltas are divided by `transform.k` to produce canvas-space deltas.

## Integration Pattern

A typical domain integration (like `client-next`'s CanvasView) looks like:

1. **Wrap content in `<Canvas>`** — provides viewport, context, and structural layers.
2. **Render nodes as children** — positioned with CSS `position: absolute; left; top`. Nodes use `useCanvasContext()` for selection state and connection initiation.
3. **Pass `renderEdges` prop** — returns SVG elements in canvas coordinate space.
4. **Pass `connectionDrag.onConnect`** — called when a connection drag completes. Domain layer creates the edge.
5. **Use `useNodeDrag` / `useNodeResize`** inside the content — attach handlers to node elements.
6. **Use `ConnectionHandle`** on nodes — source handles initiate connections, target handles receive them.

The Canvas component provides a Solid context (`CanvasContext`) with `transform`, `screenToCanvas`, `selectedIds`, `clearSelection`, `isSelected`, `onNodePointerDown`, `startConnection`, and `ctrlHeld`. Child components consume this via `useCanvasContext()` to participate in canvas interactions.
