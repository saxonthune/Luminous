---
title: Cactus Overview
summary: Architecture of the cactus canvas engine — layers, coordinate systems, DOM conventions, and design principles
tags: [cactus, canvas, engine, architecture, overview]
deps: [doc02.01]
---

# Cactus Overview

Cactus is a custom, domain-agnostic canvas engine. It is not React Flow. It uses d3-zoom for viewport control, DOM data-attributes for hit-testing, and composable Solid primitives for interaction. The engine provides primitives; the domain layer above it (in `client`) decides what nodes mean, how edges behave, and what gestures do.

**Location:** `packages/cactus/src/`
**Consumer:** `packages/client/` (the active Luminous client)

## Data Contract

Cactus is "domain-agnostic" in a precise sense: it has no opinion about a "node data model." It accepts geometry through component props and renders whatever JSX the host hands it as children. The contract surface is exactly:

**Nodes.** `<NodeContainer nodeId x y w h>{ children }</NodeContainer>` — `nodeId` is an opaque string, `x/y/w/h` are signal accessors in canvas coordinates, `children` is opaque JSX that cactus never inspects. Containment, schemas, content, titles, and any domain-specific fields live entirely above this boundary — the host computes geometry from whatever data model it owns and passes the result through props.

**Edges.** `edges?: EdgeDeclaration[]` on `<Canvas>`, where each entry is `{ id, sourceId, targetId, styling?, label?, routeBuilder? }`. `sourceId`/`targetId` must match registered `nodeId`s. Cactus filters nothing — the host decides which edges exist; cactus draws what it receives. Direction is a visual hint (arrowhead on target) not a semantic constraint. Styling may retain straight route segments or render them as cubic Bézier curves.

**Routes.** A Route is transient geometry for one Edge. A host may derive a Route from registered node rectangles and return ordered points with one visual band per segment. Cactus computes the geometry once for all visual layers, draws those segments, keeps their hit targets under the Edge's original id, places the arrowhead on the final segment, and places labels by the full Route length. A host assigns the meaning of a visual band; cactus only orders bands with Nodes that supply a matching `visualBand`. A host may temporarily freeze that shared geometry during an interaction and let it catch up afterward.

**Visual LOD Items.** `visualLod?: VisualLodDeclaration[]` on `<Canvas>` lets a
host supply screen-space Solid components anchored to registered Nodes. The
host owns each item's content, zoom range, and semantic priority. Cactus
measures the rendered unit, derives its screen anchor from the Node rectangle
and camera, tries alternate positions to avoid other Items in its collision
group, optionally searches within a host-declared screen-pixel displacement,
and then either draws it behind higher-priority Items or hides it when too
little remains visible. These Items are transient projections, never graph
or document data. A host may group Items into ranked admission cohorts when
deeper detail should appear only after every Item in the prior rank survives
placement. A host may provide a screen-size estimator so camera motion
uses an optimistic no-layout placement; cactus reconciles the actual rendered
size after motion settles. Cactus treats camera motion as an interaction
transaction: committed Items retain their candidate and displacement while the
camera moves, their presentation zoom and dimensions remain frozen, hidden
Items remain unmounted and do not enter temporary vacancies, and only severe
collisions suppress another Item. Zoom gates have distinct entry and exit
boundaries. Once input stops, cactus retains still-valid committed placements,
then admits new Items and reconciles exact measurements in one settled layout.

**Local counter-scaling.** `<CounterScale>` lets a host wrap a small subtree of
ordinary Node content and resist camera shrinkage with a bounded inverse CSS
transform. It reads the camera from Canvas context, so app components need no
zoom prop chain. `<CounterScaleSlot>` adds a declared or measured layout
allocation and a projected screen-size floor, so the host can retain one
semantic unit while it fits and withdraw it without opacity once it does not.
`<ScreenSpaceAnchor>` attaches fixed-screen interaction chrome to a canvas-space
point outside Node clipping. Visual LOD remains the mechanism for semantic
visuals that must compete for shared screen space.

**Hit-testing and styling.** Cactus uses DOM data attributes (see [DOM Attribute Conventions](#dom-attribute-conventions)). Hosts and pack renderers may stamp additional attributes for CSS targeting; cactus only reads the ones it owns.

If new code in cactus starts reading domain fields, interpreting schema names, or knowing what specific strings like `'component'` or `'renders'` mean, it belongs in the domain layer above cactus, not in cactus itself.

## Design Principles

**Domain-agnostic.** Cactus knows nothing about notes, schemas, or document models. It provides a zoomable canvas with nodes, edges, selection, and connection gestures. The domain layer maps its own concepts onto these primitives.

**Composable primitives.** Each interaction (drag, resize, connect, select) is a standalone primitive with its own state. The `Canvas` component composes them, but they can be used independently. This avoids monolithic state and makes interactions testable in isolation.

**DOM-based hit-testing.** Rather than maintaining a spatial index, cactus uses `document.elementsFromPoint()` and data attributes for hit-testing. This is simpler, naturally respects CSS z-order, and means the DOM is the source of truth for what's clickable.

**Render props for extensibility.** Edges, Visual LOD Items, connection previews,
and backgrounds accept host rendering. The engine renders and coordinates the
structural layers; the domain layer fills in the content.

## Architecture Layers

The canvas renders five conceptual DOM layers, stacked with absolute positioning:

```
┌─────────────────────────────────────────┐
│  5. Chrome                              │  Screen coords
├─────────────────────────────────────────┤
│  4. Visual LOD Items / box selection    │  Container-local screen px
├─────────────────────────────────────────┤
│  3. Connection preview SVG              │  Container-local coords
├─────────────────────────────────────────┤
│  2. Route bands and Nodes                │  Canvas coords (shared CSS transform)
├─────────────────────────────────────────┤
│  0. Background (DotGrid / custom)       │  Pattern coords (zoom-aware)
└─────────────────────────────────────────┘
```

Route bands and Nodes share the same `translate(x, y) scale(k)` transform, keeping nodes and edges aligned. Cactus orders route bands as siblings of Nodes, so a host can draw a route above a container shell and below its children. Edge geometry remains in canvas space, while cactus counter-scales stroke width, dash cadence, arrowheads, and hit targets to minimum screen-space sizes as the camera zooms out; the host still owns semantic opacity and label disclosure. The connection preview uses container-local pixel coordinates because it mixes a zoom-stable anchor (start point, derived from canvas coords) with a raw cursor position (current point, in screen coords).

## Coordinate Systems

Three coordinate spaces are in play:

| Space | Origin | Used by | Conversion |
|-------|--------|---------|------------|
| **Canvas** | Top-left of infinite canvas | Node positions, edge endpoints, geometry utilities | Zoom-invariant |
| **Screen** | Top-left of browser viewport | Pointer events, cursor tracking | `screenToCanvas(x, y)` |
| **Container-local** | Top-left of Canvas container div | Visual LOD Items, connection preview, box-select overlay | `screen - containerRect` |

The `screenToCanvas` function (from `useViewport`, returns signal Accessors) handles the screen-to-canvas conversion, accounting for the current pan/zoom transform. It and the rendered layers read the same viewport transform; D3 is the input source, not a second coordinate source. The transform object `{ x, y, k }` represents: translate by `(x, y)` pixels, then scale by `k`.

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

A typical domain integration (like `client`'s `PgCanvasView`) looks like:

1. **Wrap content in `<Canvas>`** — provides viewport, context, and structural layers. Pass `edges`, optional `chrome`/`onAction`, and `connectionDrag.onConnect`.
2. **Compute layout above cactus** — the host runs a layout algorithm (`gridLayout`, `elkLayout`, etc.) that produces `positions` and `sizes` maps, then resolves absolute canvas coordinates by walking the containment tree.
3. **Render each node inside a `<NodeContainer>`** — pass `x/y/w/h` as signal accessors derived from the layout (plus any drag overrides). Place the consumer's renderer as `children` — it is opaque to cactus.
4. **Declare edges** — build `EdgeDeclaration[]` from the host's edge model and pass via the `edges` prop. Cactus draws the direct route unless the host derives a Route from registered rectangles (see [Edge geometry](02-api-contract.md#edge-geometry)).
5. **Wire interactions outside Canvas** — call `useNodeDrag` / `useNodeResize` in the host component, pass `zoomScale: () => ctx.transform().k` so deltas are zoom-corrected, and in callbacks update the host's reactive position store. That store feeds the accessors passed to `NodeContainer`, closing the loop.
6. **Use `ConnectionHandle`** on nodes that participate in edge creation — source handles call `ctx.startConnection`; target handles set `data-connection-target` so the connection-drop hit-test can find them.

The Canvas component provides a Solid context (`CanvasContext`) with `transform`, `screenToCanvas`, `selectedIds`, `clearSelection`, `isSelected`, `onNodePointerDown`, `startConnection`, `ctrlHeld`, and the rect-registry trio `registerNodeRect` / `unregisterNodeRect` / `getNodeRects`. Child components consume this via `useCanvasContext()`.
