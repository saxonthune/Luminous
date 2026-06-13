---
title: Cactus Overview
summary: Architecture of the cactus canvas engine — layers, coordinate systems, DOM conventions, and design principles
tags: [cactus, canvas, engine, architecture, overview]
deps: [doc02.01]
---

# Cactus Overview

Cactus is a custom, domain-agnostic canvas engine. It is not React Flow. It uses d3-zoom for viewport control, DOM data-attributes for hit-testing, and composable Solid primitives for interaction. The engine provides primitives; the domain layer above it (in `client-next`) decides what nodes mean, how edges behave, and what gestures do.

**Location:** `packages/cactus/src/`
**Consumer:** `packages/client-next/` (the active Luminous client)

## Data Contract

Cactus is "domain-agnostic" in a precise sense: it has no opinion about a "node data model." It accepts geometry through component props and renders whatever JSX the host hands it as children. The contract surface is exactly:

**Nodes.** `<NodeContainer nodeId x y w h>{ children }</NodeContainer>` — `nodeId` is an opaque string, `x/y/w/h` are signal accessors in canvas coordinates, `children` is opaque JSX that cactus never inspects. Containment, schemas, content, titles, and any domain-specific fields live entirely above this boundary — the host computes geometry from whatever data model it owns and passes the result through props.

**Edges.** `edges?: EdgeDeclaration[]` on `<Canvas>`, where each entry is `{ id, sourceId, targetId, styling?, label? }`. `sourceId`/`targetId` must match registered `nodeId`s. Cactus filters nothing — the host decides which edges exist; cactus draws what it's given. Direction is a visual hint (arrowhead on target) not a semantic constraint.

**Hit-testing and styling.** Cactus uses DOM data attributes (see [DOM Attribute Conventions](#dom-attribute-conventions)). Hosts and pack renderers may stamp additional attributes for CSS targeting; cactus only reads the ones it owns.

If new code in cactus starts reading domain fields, interpreting schema names, or knowing what specific strings like `'component'` or `'renders'` mean, it belongs in the domain layer above cactus, not in cactus itself.

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

## Mount Lifecycle

A `<Canvas>` mounts in a fixed sequence; understanding it matters when modifying `NodeContainer`, `EdgeLayer`, or any code that touches the rect registry.

1. **Canvas mounts.** Internally calls `useViewport()` (creates the `transform` signal and attaches d3-zoom to the container ref), creates an empty reactive node-rect `Map` with a version counter, then calls `useConnectionDrag()`, `useSelection()`, and `useBoxSelect()`. Assembles `CanvasContextValue` and wraps `children` in `<CanvasContext.Provider>`. No nodes are registered yet; the edge layer is rendered but has nothing to draw.
2. **Children render.** Each `<NodeContainer>` runs a `createRenderEffect` that synchronously calls `ctx.registerNodeRect(nodeId, {x,y,w,h})` during the render pass — **before paint, before EdgeLayer reads rects**. This is the ordering guarantee that prevents edge flicker on first frame. The effect re-fires reactively whenever any of the `x/y/w/h` accessors change.
3. **EdgeLayer reads rects.** EdgeLayer is rendered by Canvas itself, positioned in the JSX after `children`. Its per-edge `createMemo` calls `getNodeRects()` and computes center-to-center endpoints. The memo subscribes to the rect-map version counter, so any subsequent `registerNodeRect` automatically invalidates and re-renders affected edges.
4. **Steady state.** Pan/zoom updates the `transform` signal — CSS `transform: translate/scale` on the node layer div and SVG layer move together. Node drag through `useNodeDrag` callbacks updates host position state, which flows back into `NodeContainer`'s accessors and re-registers rects. Connection drag, selection, and box-select operate independently through context.
5. **Unmount.** Each `NodeContainer` cleanup calls `unregisterNodeRect(nodeId)`. d3-zoom is detached.

The key invariant: **edges read what `NodeContainer`s register**. Anything that bypasses `NodeContainer` (custom node primitives, tests) must call `registerNodeRect`/`unregisterNodeRect` directly or edges will not appear.

## Integration Pattern

A typical domain integration (like `client-next`'s `PgCanvasView`) looks like:

1. **Wrap content in `<Canvas>`** — provides viewport, context, and structural layers. Pass `edges`, optional `chrome`/`onAction`, and `connectionDrag.onConnect`.
2. **Compute layout above cactus** — the host runs a layout algorithm (`gridLayout`, `elkLayout`, etc.) that produces `positions` and `sizes` maps, then resolves absolute canvas coordinates by walking the containment tree.
3. **Render each node inside a `<NodeContainer>`** — pass `x/y/w/h` as signal accessors derived from the layout (plus any drag overrides). Place the consumer's renderer as `children` — it is opaque to cactus.
4. **Declare edges** — build `EdgeDeclaration[]` from the host's edge model and pass via the `edges` prop. Cactus draws straight lines (see [Edge geometry](02-api-contract.md#edge-geometry)).
5. **Wire interactions outside Canvas** — call `useNodeDrag` / `useNodeResize` in the host component, pass `zoomScale: () => ctx.transform().k` so deltas are zoom-corrected, and in callbacks update the host's reactive position store. That store feeds the accessors passed to `NodeContainer`, closing the loop.
6. **Use `ConnectionHandle`** on nodes that participate in edge creation — source handles call `ctx.startConnection`; target handles set `data-connection-target` so the connection-drop hit-test can find them.

The Canvas component provides a Solid context (`CanvasContext`) with `transform`, `screenToCanvas`, `selectedIds`, `clearSelection`, `isSelected`, `onNodePointerDown`, `startConnection`, `ctrlHeld`, and the rect-registry trio `registerNodeRect` / `unregisterNodeRect` / `getNodeRects`. Child components consume this via `useCanvasContext()`.
