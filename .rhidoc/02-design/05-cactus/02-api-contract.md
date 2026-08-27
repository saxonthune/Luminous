---
title: Cactus API Contract
summary: Complete public API reference for the cactus canvas engine — components, hooks, types, and geometry utilities
tags: [cactus, canvas, api, components, hooks, types]
deps: [doc02.05.01]
---

# Cactus API Contract

Public API of the cactus canvas engine (`packages/cactus/src/`). Everything exported from the barrel `index.ts` is documented here. Internal modules are not part of the contract.

## Minimum viable canvas

```tsx
import { Canvas, NodeContainer, useCanvasContext } from '@luminous/cactus';

function MyApp() {
  return (
    <Canvas>
      <NodeContainer nodeId="a" x={() => 100} y={() => 100} w={() => 200} h={() => 80}>
        <div style={{ padding: '8px' }}>Hello</div>
      </NodeContainer>
    </Canvas>
  );
}
```

The `Canvas` provides pan/zoom (`useViewport`), selection (`useSelection`), and box-select infrastructure automatically. Position/size props on `NodeContainer` are accessors so they participate in Solid's reactivity. Place all `NodeContainer`s and any hook calls that need `useCanvasContext` **inside `<Canvas>`** — the context throws if consumed outside.

## Data-attribute contract

Cactus uses DOM data attributes as the public hit-testing contract. Renderers and consumers should preserve these (already set by primitives — listed here for awareness when writing custom hit logic or pack renderers):

| Attribute | Set by | Purpose |
|-----------|--------|---------|
| `data-node-id` | `NodeContainer`, `ConnectionHandle` | Identifies the node a DOM subtree belongs to |
| `data-container-id` | `NodeContainer` | This element is a nestable container; matches `data-node-id` |
| `data-drop-target="true"` | `NodeContainer` | Eligible drop target for `findContainerAt` |
| `data-connection-target="true"` | `NodeContainer`, `ConnectionHandle` | Eligible target for `useConnectionDrag` hit-test |
| `data-handle-id` | `ConnectionHandle` (when `id` is set) | Named handle id within a node |
| `data-drag-handle="true"` | `DragHandle` | Elements that initiate node drag when `handleSelector='[data-drag-handle]'` |
| `data-no-pan="true"` | `NodeContainer`, `ConnectionHandle`, `DragHandle` | Pointer events on this subtree do **not** start a viewport pan |

## Components

### Canvas

The root container. Composes viewport, selection, connection drag, and box-select. Renders the layered DOM structure (background, nodes, edges, overlays).

```typescript
interface CanvasProps {
  viewportOptions?: UseViewportOptions
  connectionDrag?: {
    onConnect: (connection: Connection) => void
    isValidConnection?: (connection: Connection) => boolean
  }
  boxSelect?: {
    /** Optional override. Cactus otherwise uses the measured rectangles
        registered by NodeContainer. */
    getNodeRects?: () => NodeRect[]
  }
  edges?: EdgeDeclaration[]
  visualLod?: VisualLodDeclaration[]
  edgeEmphasis?: {
    dimUnselected?: boolean
    selectedWidthMultiplier?: number
  }
  edgeLod?: EdgeLodPolicy
  freezeEdgeRouting?: () => boolean
  renderConnectionPreview?: (coords: ConnectionPreviewCoords, transform: Transform) => JSX.Element
  renderBackground?: (transform: Transform, patternId?: string) => JSX.Element
  onBackgroundPointerDown?: (event: PointerEvent) => void
  onBackgroundContextMenu?: (event: MouseEvent) => void
  chrome?: ChromeSchema
  onAction?: (id: string, payload?: unknown) => void
  nodeContextMenu?: (nodeId: string) => MenuSchema | undefined
  backgroundContextMenu?: () => MenuSchema | undefined
  class?: string
  patternId?: string
  children: JSX.Element
  ref?: (el: CanvasRef) => void
}
```

`edges` is declarative: cactus computes straight-line geometry from registered node rects (see [Edge geometry](#edge-geometry) and [EdgeDeclaration](#edgedeclaration)). Box selection uses those same measured rectangles by default, so its hit-testing follows the rendered Nodes. A host may supply `boxSelect.getNodeRects` only when it needs a different selectable set or geometry. `edgeEmphasis` controls the generic selection treatment: unrelated Edges dim by default; a host can retain their opacity and multiply the stroke width of selected Nodes' incident Edges. `edgeLod` lets the host map an Edge plus the current zoom and emphasis state to visual opacity and label visibility. The host therefore retains semantic disclosure decisions while cactus applies them consistently to its Edge layers. `chrome` renders screen-space toolbars/menus in slots above the canvas; `onAction` dispatches action ids from chrome controls and registered hotkeys. `nodeContextMenu` and `backgroundContextMenu` return `MenuSchema` for right-click menus — return `undefined` to suppress. The background producer receives the cursor in both viewport coordinates (`clientX`, `clientY`) and pan/zoom-adjusted canvas coordinates (`canvasX`, `canvasY`), so an action can preserve the point that opened its menu.

`onBackgroundContextMenu` fires only when the right-click target is **not** inside a `data-container-id` element (i.e. genuine background). `preventDefault()` is called for you. Right-clicks on nodes bubble naturally — handle them on the node renderer's `onContextMenu`.

`visualLod` declares host-rendered screen-space units anchored to registered
Nodes. Cactus measures and places these units above the graph and below chrome;
see [Visual LOD](#visual-lod).

**Ref methods** (`CanvasRef`) — accessed via ref callback (not `forwardRef`):

| Method | Signature | Description |
|--------|-----------|-------------|
| `fitView` | `(rects: NodeRect[], padding?: number) => void` | Smoothly zoom/pan to fit rectangles in view |
| `centerView` | `(rect: NodeRect) => void` | Smoothly center a rectangle without changing zoom |
| `focusView` | `(rect: NodeRect, zoom: number, animate?: boolean) => void` | Center a rectangle at a requested zoom |
| `setView` | `(transform: Transform, animate?: boolean) => void` | Move to an exact camera transform, with scale clamped to the viewport extent |
| `screenToCanvas` | `(screenX, screenY) => {x, y}` | Convert screen coordinates to canvas space |
| `getTransform` | `() => Transform` | Current viewport transform |
| `zoomIn` | `() => void` | Zoom in 1.15x with 300ms animation |
| `zoomOut` | `() => void` | Zoom out 1/1.15x with 300ms animation |
| `clearSelection` | `() => void` | Deselect all nodes |

### NodeContainer

The primary primitive for rendering a node. Positions its children absolutely at `(x, y)` in canvas coordinates and stamps the data-attributes that drive hit-testing. Renders no drag affordance of its own. By default (consumer omits `handleSelector` on `useNodeDrag`), any pointer-down on the container body initiates drag. For scoped drag handles, place `<DragHandle>` inside `children` and set `handleSelector='[data-drag-handle]'`.

```typescript
interface NodeContainerProps {
  nodeId: string
  x: () => number              // accessor (canvas coords)
  y: () => number
  w: () => number              // applied as min-width
  h: () => number              // applied as min-height
  visualBand?: () => number    // optional route-band ordering number
  interactive?: () => boolean // false removes pointer hit-testing but preserves geometry
  onPointerDown?: (e: PointerEvent) => void
  onContextMenu?: (e: MouseEvent) => void
  children?: JSX.Element
}
```

Sizing model: `w` and `h` define the Node's canvas-space dimensions. The Node
registers that rectangle for Edges and other geometry consumers. `visualBand`
lets a host place a Node between route bands; cactus assigns no domain meaning
to the number. Setting `interactive` to false removes the Node from pointer
hit-testing without unregistering its rectangle, allowing a host to cull a
visual representation without destabilizing Edge geometry.

### NodeShell

Lower-level wrapper around `NodeContainer` that adds a default visual style (border, background, shadow). Pure presentation — `NodeContainer` is preferred when you bring your own renderer.

```typescript
interface NodeShellProps extends NodeContainerProps {
  selected?: boolean
  class?: string
  style?: JSX.CSSProperties
}
```

### DragHandle

A standalone draggable element that stamps `data-drag-handle="true"` and `data-no-pan="true"`. Place inside a node's children and set `handleSelector='[data-drag-handle]'` on `useNodeDrag` to restrict drag initiation to this element.

```typescript
interface DragHandleProps {
  class?: string
  style?: JSX.CSSProperties
  children?: JSX.Element
}
```

### NodeBody

A thin auto-layout primitive for structuring node content. A styled flex div — no engine state. "Hug contents" behavior comes from `NodeContainer`'s `ResizeObserver`-based measured-rect registration.

```typescript
interface NodeBodyProps {
  direction?: 'vertical' | 'horizontal'  // default: 'vertical'
  gap?: number | string                   // number → px, string → as-is
  padding?: number | string              // number → px, string → as-is
  align?: 'start' | 'center' | 'end' | 'stretch'           // default: 'stretch'
  justify?: 'start' | 'center' | 'end' | 'space-between'   // default: 'start'
  class?: string
  style?: JSX.CSSProperties
  children?: JSX.Element
}
```

Consumer controls all styling. Any additional `style` props merge over the computed flex styles. Use `width: '100%'` and `height: '100%'` in `style` when the node should fill the `NodeContainer`.

### ResizeHandle

A corner/edge handle that stamps `data-resize-handle` and forwards `onPointerDown` to `useNodeResize.onResizePointerDown`. Pair the two for full resize behavior.

```typescript
interface ResizeHandleProps {
  nodeId: string
  direction: ResizeDirection
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void
  class?: string
  style?: JSX.CSSProperties
}
```

### DotGrid

Default background. SVG pattern of dots that scales with zoom.

```typescript
interface DotGridProps {
  transform: Transform
  patternId?: string
  spacing?: number          // default 16
  dotRadius?: number        // default 1
  dotColor?: string         // default 'var(--color-dot-grid)'
  backgroundColor?: string  // default 'transparent'
}
```

### CrossGrid

Alternative background. SVG pattern of crosses at alternating grid positions.

```typescript
interface CrossGridProps {
  transform: Transform
  patternId?: string
  spacing?: number          // default 40
  strokeColor?: string      // default 'var(--color-dot-grid)'
  strokeWidth?: number      // default 1.2
  crossSize?: number        // default 18
  backgroundColor?: string  // default 'transparent'
  rotation?: number         // default 0
}
```

### ConnectionHandle

Interactive element for initiating (source) or receiving (target) connections. Source handles start a drag on pointer down; target handles are hit-tested on pointer up via DOM attributes.

```typescript
interface ConnectionHandleProps {
  type: 'source' | 'target'
  id?: string                // Handle ID (null if omitted)
  nodeId: string
  onStartConnection?: (nodeId: string, handleId: string | null, clientX: number, clientY: number) => void
  style?: JSX.CSSProperties
  className?: string
  children?: JSX.Element
}
```

Source handles anchor the connection line at their right-edge midpoint. Target handles set `data-connection-target`, `data-node-id`, and `data-handle-id` attributes.

### EdgeLabel

SVG foreignObject wrapper for rendering labels on edges. Renders HTML content centered at `(x, y)` in canvas coordinates. Must be placed inside a transformed SVG `<g>`.

```typescript
interface EdgeLabelProps {
  x: number
  y: number
  children: JSX.Element
  className?: string
  style?: JSX.CSSProperties
  onContextMenu?: (event: MouseEvent) => void
}
```

Container size: 400x60px. Content auto-shrinks via `width: fit-content`. Blur backdrop applied.

### ConnectionPreview

Simple SVG path for rendering connection preview lines during drag.

```typescript
interface ConnectionPreviewProps {
  d: string                     // SVG path data
  stroke?: string               // default 'var(--color-accent)'
  strokeWidth?: number          // default 2
  strokeDasharray?: string      // default '4 4'
}
```

### CounterScale

`CounterScale` is a local visual wrapper for host content rendered inside the
geometrically scaled graph. It reads the Canvas camera through context and
applies a bounded inverse transform around a declared origin. It requires no
zoom prop drilling.

```typescript
interface CounterScaleProps {
  referenceZoom?: number // default: 1
  minScale?: number      // default: 1
  maxScale?: number      // default: unbounded
  origin?: JSX.CSSProperties['transform-origin'] // default: "top left"
  enabled?: boolean
  class?: string
  style?: JSX.CSSProperties
  children?: JSX.Element
}
```

The transform changes pixels, not layout geometry: it does not enlarge the
Node's registered rectangle, reserve room around the Item, or avoid collisions.
Hosts use it for modest, bounded resistance to shrinking within a Node. Content
that must escape Node clipping or coordinate globally belongs in Visual LOD.

### Visual LOD

A Visual LOD Item is a host-rendered component whose data may belong to a Node
but whose representation is drawn separately in screen space. The host declares
meaning and priority; cactus owns measurement, anchor conversion, collision
placement, stacking, and visibility.

```typescript
interface VisualLodDeclaration {
  id: string
  anchor: {
    nodeId: string
    placement?: VisualLodPlacement
    offset?: { x: number; y: number } // screen px
  }
  priority: number                   // larger wins and paints above
  collisionGroup?: string           // default: "default"
  admission?: {
    group: string                    // progressive-disclosure cohort
    rank: number                     // lower ranks must complete first
  }
  minZoom?: number                  // inclusive
  maxZoom?: number                  // exclusive
  placement?: {
    candidates?: VisualLodPlacement[]
    displacement?: {
      maxDistance: number              // screen px
      step: number                     // screen px
      directions: ('up' | 'right' | 'down' | 'left')[]
    }
    allowOcclusion?: boolean         // default: true
    minVisibleFraction?: number      // default: 0.4
  }
  size?: {
    estimate: (zoom: number) => { w: number; h: number }
    key?: string                     // content/style measurement identity
  }
  pointerEvents?: 'none' | 'auto'
  render: (state: {
    zoom: () => number
    status: () => 'placed' | 'occluded' | 'hidden'
  }) => JSX.Element
}
```

The layer mounts render results only for Items in the current visible placement;
hidden candidates with estimates remain declaration and estimated-size data
until admitted. An unestimated candidate mounts invisibly at rest only long
enough to establish its first measurement. The layer observes mounted Items'
screen dimensions. While the camera moves,
cactus freezes the presentation zoom supplied to `render` and reuses each
committed Item's dimensions, so host typography and other layout-affecting
styles do not reflow per camera frame. It updates anchor coordinates at most
once per animation frame, then advances presentation zoom and reconciles against
the exact DOM size after motion settles. `size.key` changes when content or
styling invalidates a prior exact measurement. A declaration without an
estimator falls back to its last measured size during motion.

Placement has three internal phases. At idle, the last result is the committed
layout. During camera interaction, cactus projects that layout through the
changing transform without searching for new candidates or admitting hidden
Items; a hard collision may suppress a lower-priority Item for the remainder of
the gesture. After input settles, cactus measures again and performs one full
placement pass, retaining committed visible Items before filling newly available
space. Separate entry and exit margins around zoom gates prevent repeated
visibility changes near a threshold. This lifecycle requires no additional host
declaration.

At rest, on a Node-rectangle change or content resize, cactus derives candidate
rectangles in container-local screen coordinates. It processes eligible
declarations by descending priority with stable id tie-breaking. The first
collision-free candidate wins; a prior candidate is tried first while it
remains free, which prevents position hopping between settled layouts. If none is free, the
least-overlapping candidate is drawn below the conflicting higher-priority
Items while its approximate visible fraction meets `minVisibleFraction`;
otherwise it is hidden. Items collide only within their `collisionGroup`.
When `placement.displacement` is present, cactus also searches away from each
fixed candidate in bounded screen-pixel steps. It prefers smaller displacement
and retains a prior collision-free displacement to keep camera motion stable.

Declarations may opt into progressive disclosure with `admission`. Cactus
admits a group's distinct ranks in ascending order. It considers the next rank
only when every Item in the current rank remains visible; if any Item is hidden,
all higher ranks in that group are hidden. Admission groups are independent,
and declarations without admission metadata retain ordinary priority ordering.
The host derives group and rank from domain meaning; cactus applies the rule to
the rendered Items.

This is a deterministic greedy approximation to weighted point-feature label
placement. It moves no Node and persists no placement. The host converts domain
meaning such as containment depth or selection importance into the generic
numeric `priority`.

## Edges

### EdgeDeclaration

Declarative edge passed via `<Canvas edges={...}>`. Cactus owns geometry; the host declares connectivity and optional styling hints.

```typescript
interface EdgeDeclaration {
  id: string
  sourceId: string
  targetId: string
  styling?: EdgeStyling
  label?: () => JSX.Element
  routeBuilder?: (nodeRects: ReadonlyMap<string, RegisteredNodeRect>) => EdgeRoute | null
}

interface EdgeRoute {
  points: RoutePoint[]
  segmentLayers?: number[]
}

interface RoutePoint {
  x: number
  y: number
}

interface EdgeStyling {
  colorToken?: string      // CSS variable name without leading -- (e.g. 'accent', 'fg-muted')
  dash?: 'solid' | 'dashed' | 'dotted'
  width?: number           // default 1.5
  arrowHead?: boolean      // default false — triangle on target end
}
```

### Edge geometry

Without a `routeBuilder`, cactus renders a straight route between the source and target borders. It bundles parallel direct routes and calculates their labels from the direct route length.

```
x1 = src.x + src.w / 2     x2 = tgt.x + tgt.w / 2
y1 = src.y + src.h / 2     y2 = tgt.y + tgt.h / 2
```

where `src`/`tgt` come from `ctx.getNodeRects()`. A `routeBuilder` receives the same rect map and returns an ordered point list, or `null` to use that direct route. Each segment may name a visual band. Cactus computes one shared geometry map for the line bands and label layer, renders route bands as separate overflow-visible SVG layers, preserves the declared Edge id for every segment's hit target, attaches the arrowhead to the final segment, and finds a label midpoint across the total route length. Endpoints and derived Routes recompute reactively whenever a `NodeContainer` re-registers its rect. While `freezeEdgeRouting?.()` is true, cactus retains the last geometry map and catches up when the accessor becomes false.

The host owns the route projection: containment, ports, collision policy, and domain geometry remain outside cactus. Cactus owns only generic route rendering, hit-testing, labels, and visual stacking.

## Hooks

### Lifecycle summary

| Hook | Must be inside `<Canvas>`? | Reads `CanvasContext`? | Notes |
|------|----------------------------|------------------------|-------|
| `useViewport` | No (called by Canvas itself) | No | Direct use only when composing your own root |
| `useNodeDrag` | Recommended (reads zoom) | No (you pass `zoomScale`) | Pass result's `onPointerDown` to `NodeContainer` |
| `useNodeResize` | Recommended | No | Pair with `ResizeHandle` |
| `useConnectionDrag` | Recommended | No | Called by Canvas when `connectionDrag` prop is set |
| `useGesture` | Recommended | No | Composable press, drag, resize, connection, and marquee gestures |
| `useSelection` | Recommended | No (called internally by Canvas) | Selection already exposed via `useCanvasContext` |
| `useBoxSelect` | Yes | Yes (transform) | Activated by Shift+drag on background |
| `useKeyboardShortcuts` | No | No | Window-level listener |
| `useNodeLinks` | No | No | Pure lookup; no DOM/event side-effects |

### useGesture

Composes pointer gestures for a host node layer. Its optional `dragGroup` resolver
returns the Node ids that should move with a pressed Node. Cactus reports that
same group through `draggedNodeIds` and as the final argument of drag callbacks;
the host supplies the domain meaning (for example, the current selection) and
persists the resulting position changes.

```typescript
useGesture({
  zoomScale,
  dragGroup: (pressedId) => selectedIds().includes(pressedId) ? selectedIds() : [pressedId],
  callbacks: {
    onDragEnd: (pressedId, dx, dy, nodeIds) => savePositions(nodeIds, dx, dy),
  },
})
```

### useViewport

Manages pan/zoom via d3-zoom. Returns a container ref and programmatic controls.

```typescript
interface UseViewportOptions {
  minZoom?: number   // default 0.15
  maxZoom?: number   // default 2
}

function useViewport(options?: UseViewportOptions): {
  transform: Accessor<Transform>
  setContainerRef: (el: HTMLDivElement) => void   // pass to <div ref={...}>
  containerEl: Accessor<HTMLDivElement | undefined>
  fitView: (rects: NodeRect[], padding?: number) => void
  zoomIn: () => void
  zoomOut: () => void
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
}
```

Called automatically by `<Canvas>`. Call directly only if you're composing your own canvas root.

### useNodeDrag

Manages node dragging. Converts screen deltas to canvas deltas (zoom-aware). Left button only.

```typescript
interface UseNodeDragOptions {
  zoomScale: () => number              // accessor — reads current zoom each frame
  handleSelector?: string               // CSS selector to restrict drag initiation
  callbacks: {
    onDragStart?: (nodeId: string, event: PointerEvent) => void
    onDrag?: (nodeId: string, deltaX: number, deltaY: number) => void
    onDragEnd?: (nodeId: string) => void
  }
}

function useNodeDrag(options: UseNodeDragOptions): {
  draggingNodeId: Accessor<string | null>
  onPointerDown: (nodeId: string, event: PointerEvent) => void
}
```

`deltaX`/`deltaY` are **cumulative** from drag start in **canvas coordinates** (zoom-corrected) — not per-frame deltas. Apply as `basePosition + delta`, where `basePosition` was snapshotted at `onDragStart`. Forward the returned `onPointerDown` to each node's `NodeContainer.onPointerDown`.

### useNodeResize

Manages node resizing via corner/edge handles. Direction-aware: dragging a left edge produces negative `deltaWidth`.

```typescript
type ResizeDirection = {
  horizontal: 'left' | 'right' | 'none'
  vertical: 'top' | 'bottom' | 'none'
}

interface UseNodeResizeOptions {
  zoomScale: () => number              // accessor
  callbacks: {
    onResizeStart?: (nodeId: string, direction: ResizeDirection) => void
    onResize?: (nodeId: string, deltaWidth: number, deltaHeight: number, direction: ResizeDirection) => void
    onResizeEnd?: (nodeId: string) => void
  }
}

function useNodeResize(options: UseNodeResizeOptions): {
  resizingNodeId: Accessor<string | null>
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void
}
```

### useConnectionDrag

Manages connection drag gesture. RAF-throttled cursor tracking. Hit-tests for `data-connection-target` elements on pointer up.

```typescript
interface ConnectionDragState {
  sourceNodeId: string
  sourceHandle: string | null
  startCanvasX: number        // Zoom-invariant anchor
  startCanvasY: number
  currentScreenX: number      // Updated per frame
  currentScreenY: number
}

interface UseConnectionDragOptions {
  onConnect: (connection: Connection) => void
  isValidConnection?: (connection: Connection) => boolean
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
}

function useConnectionDrag(options: UseConnectionDragOptions): {
  connectionDrag: ConnectionDragState | null
  startConnection: (sourceNodeId: string, sourceHandle: string | null, clientX: number, clientY: number) => void
}
```

### useSelection

Manages selection state with click semantics: single-click replaces, shift/ctrl-click toggles.

```typescript
interface UseSelectionOptions {
  onSelectionChange?: (selectedIds: string[]) => void
}

function useSelection(options: UseSelectionOptions): {
  selectedIds: Accessor<string[]>
  setSelectedIds: (ids: string[]) => void
  isSelected: (id: string) => boolean
  onNodePointerDown: (nodeId: string, event: PointerEvent) => void
  clearSelection: () => void
  mergeBoxSelection: (ids: string[]) => void
}
```

`mergeBoxSelection` replaces the current selection (used by `useBoxSelect` during drag).

### useBoxSelect

Implements shift-drag rectangle selection. Converts screen rectangle to canvas coordinates and performs AABB intersection tests.

```typescript
interface UseBoxSelectOptions {
  transform: Accessor<Transform>
  containerRef: () => HTMLElement | undefined
  getNodeRects: () => NodeRect[]
  onSelectionChange?: (selectedIds: string[]) => void
  onBoxSelectHits?: (hitIds: string[]) => void
}

function useBoxSelect(options: UseBoxSelectOptions): {
  selectedIds: Accessor<string[]>
  clearSelection: () => void
  selectionRect: Accessor<{ x: number; y: number; width: number; height: number } | null>
}
```

`selectionRect` is in screen coordinates (for rendering the overlay). Activated by Shift+drag on canvas background.

### useKeyboardShortcuts

Registers keyboard shortcuts. Skips input/textarea/contenteditable elements.

```typescript
interface KeyboardShortcut {
  key: string | string[]       // event.key values
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  mod?: boolean                // Ctrl on Win/Linux, Meta on Mac
  action: () => void
}

function useKeyboardShortcuts(options: {
  shortcuts: KeyboardShortcut[]
  disabled?: boolean
}): void
```

`mod: true` is the platform-aware modifier. First matching shortcut wins.

### useNodeLinks

Manages leader-follower relationships for grouped node movement. Lookup-only — does not intercept drag events.

```typescript
interface NodeLink {
  id: string
  leader: string
  follower: string
}

type FollowerDragDecision = 'allow' | 'block' | 'redirect-to-leader'

function useNodeLinks(options: {
  links: NodeLink[]
  onFollowerDragAttempt?: (link: NodeLink, followerId: string) => FollowerDragDecision
}): {
  getFollowers: (leaderId: string) => string[]
  isFollower: (nodeId: string) => boolean
  checkFollowerDrag: (nodeId: string) => FollowerDragDecision
  getLeader: (followerId: string) => string | undefined
}
```

## Context

### CanvasContext / useCanvasContext

Global canvas state provided by `<Canvas>` via Solid context. Child components consume this for selection, connections, and transform info.

```typescript
interface CanvasContextValue {
  transform: Accessor<Transform>
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
  startConnection: (nodeId: string, handleId: string | null, clientX: number, clientY: number) => void
  connectionDrag: Accessor<ConnectionDragState | null>
  selectedIds: Accessor<string[]>
  clearSelection: () => void
  isSelected: (id: string) => boolean
  onNodePointerDown: (nodeId: string, event: PointerEvent) => void
  setSelectedIds: (ids: string[]) => void
  ctrlHeld: Accessor<boolean>
  /** Register a node's canvas-space bounding rect. Called by NodeContainer in a
   *  createRenderEffect during render so rects are available before EdgeLayer reads them. */
  registerNodeRect: (id: string, rect: NodeRect) => void
  /** Unregister on cleanup. Called by NodeContainer. */
  unregisterNodeRect: (id: string) => void
  /** Reactive accessor over all currently registered rects. EdgeLayer subscribes to this
   *  to recompute endpoints when any node moves or resizes. */
  getNodeRects: () => ReadonlyMap<string, NodeRect>
}

function useCanvasContext(): CanvasContextValue  // throws if outside Canvas
```

`registerNodeRect` / `unregisterNodeRect` / `getNodeRects` are the public mechanism by which edges know where nodes are. Custom node renderers do not need to call these — wrapping content in `<NodeContainer>` registers automatically. They are exposed in the contract because alternative node primitives (or tests) may bypass `NodeContainer`.

`NodeRect` shape: `{ x: number; y: number; w: number; h: number }` — note `w`/`h` (not `width`/`height`); this is the registry's internal shape and differs from the public `NodeRect` type used by `boxSelect.getNodeRects`, which uses `width`/`height` plus `id`.

## Geometry Utilities

### containment.ts

```typescript
function computeBounds(children: Rect[], options?: ComputeBoundsOptions): Rect
function isPointInRect(point: { x: number; y: number }, rect: Rect): boolean
function findContainerAt(screenX: number, screenY: number): string | null
```

`computeBounds` computes the AABB of child rectangles with padding. `findContainerAt` hit-tests DOM for `data-drop-target` + `data-container-id` elements.

### containerOps.ts

```typescript
function resolveAbsolutePosition(nodeId: string, nodes: ContainerNode[]): { x: number; y: number }
function resolveAbsolutePositionByParentOf(
  nodeId: string,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  parentOf: ReadonlyMap<string, string>,
): { x: number; y: number }
function computeAttach(nodeId: string, containerId: string, nodes: ContainerNode[]): { x: number; y: number }
function computeDetach(nodeId: string, nodes: ContainerNode[]): { x: number; y: number }
function computeContainerFit(childGeometries: NodeGeometry[], config?: ContainerFitConfig): OrganizerFitResult
```

`resolveAbsolutePositionByParentOf` is the variant used when a layout has already produced a `positions` map and a `parentOf` lookup (e.g., output of `gridLayout` / `elkLayout` plus `ContainmentTree`). Walks the parent chain summing relative positions.

Position conversions for nesting operations. `computeAttach` returns the relative position a node should have inside a container to preserve its absolute canvas position. `computeDetach` is the inverse.

### geometry.ts

```typescript
function toRelativePosition(nodePos: Position, parentPos: Position): Position
function toAbsolutePosition(nodePos: Position, parentPos: Position): Position
function computeOrganizerFit(children: NodeGeometry[], config?: OrganizerLayoutConfig): OrganizerFitResult

const DEFAULT_ORGANIZER_LAYOUT: OrganizerLayoutConfig  // { padding: 20, headerHeight: 40 }
```

## Core Types

```typescript
interface Transform { x: number; y: number; k: number }

interface Connection {
  source: string
  sourceHandle: string | null
  target: string
  targetHandle: string | null
}

interface ConnectionPreviewCoords {
  sourceNodeId: string
  sourceHandle: string | null
  startX: number      // Container-local pixels (zoom-stable, re-derived each frame)
  startY: number
  currentX: number    // Container-local pixels (cursor position)
  currentY: number
}

type NodeRect = { id: string; x: number; y: number; width: number; height: number }

interface Rect { x: number; y: number; width: number; height: number }
interface Position { x: number; y: number }
interface Size { width: number; height: number }

interface NodeGeometry {
  position: Position
  width?: number
  height?: number
  measured?: { width?: number; height?: number }
}

interface OrganizerLayoutConfig {
  padding: number       // default 20
  headerHeight: number  // default 40
}

interface OrganizerFitResult {
  positionDelta: Position       // Shift to apply to container
  size: Size
  childPositionDelta: Position  // = -positionDelta (for children)
}

interface ContainerNode {
  id: string
  parentId?: string
  position: Position
}

interface ContainerFitConfig {
  layout?: OrganizerLayoutConfig
}
```

## Layout primitives

Seven pure functions take a containment tree and produce `{ positions, sizes }`. They share the bottom-up invariant: parents are sized from packed children, so leaf sizes drive everything. Pass measured leaf sizes via each algorithm's `sizeOf` parameter when available (see `viewer-auto-size-nodes` for the wiring pattern).

| Function | When to use |
|----------|-------------|
| `gridLayout` | Default for nested containment without edge-driven ordering. Cheap, deterministic. Children of a composite pack into a square-ish grid. |
| `elkLayout` | When arrow edges should influence placement (layered DAG-like layouts). Async. Accepts `sizeOf`, `direction`, `headerHeight`. |
| `tidyLayout` | Classical Reingold–Tilford for tree-shaped content. |
| `treeLayout` | Lighter tree layout for the common single-root case. |
| `compositeLayout` | Mixes a tidy/tree pass for the spine with a packing pass for leaves. |
| `dagLayout` | Layered layout for true DAGs (no containment recursion). |
| `forceDirectedLayout` | Last resort for graphs without natural hierarchy. |

Full input/output signatures and choice tradeoffs are documented separately in [Layout primitives](03-layout-primitives.md).

## Performance utilities

```typescript
function traceCallback<F extends (...args: any[]) => any>(label: string, fn: F): F
function observeLongTasks(): () => void               // returns cleanup
function markInteraction(label: string): { end: () => void }
function createPerformanceMonitor(options?: PerformanceMonitorOptions): PerformanceMonitorResult
```

`traceCallback` wraps a callback with a `performance.mark`/`measure` pair around each invocation (no-op in production). `observeLongTasks` registers a `PerformanceObserver` for long tasks during development. `markInteraction` is for user-initiated gestures (drag, connection) that span multiple frames. `createPerformanceMonitor` aggregates frame timings and exposes signals for an HUD.

## CSS Variables

The engine references these CSS custom properties:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `--color-accent` | ConnectionPreview, box-select | Primary interaction color |
| `--color-accent-10` | Box-select overlay | Accent at 10% opacity |
| `--color-dot-grid` | DotGrid, CrossGrid | Grid pattern color |
| `--color-surface` | EdgeLabel | Label background |
