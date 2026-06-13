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
    getNodeRects: () => NodeRect[]
  }
  edges?: EdgeDeclaration[]
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

`edges` is declarative: cactus computes straight-line geometry from registered node rects (see [Edge geometry](#edge-geometry) and [EdgeDeclaration](#edgedeclaration)). `chrome` renders screen-space toolbars/menus in slots above the canvas; `onAction` dispatches action ids from chrome controls and registered hotkeys. `nodeContextMenu` and `backgroundContextMenu` return `MenuSchema` for right-click menus — return `undefined` to suppress.

`onBackgroundContextMenu` fires only when the right-click target is **not** inside a `data-container-id` element (i.e. genuine background). `preventDefault()` is called for you. Right-clicks on nodes bubble naturally — handle them on the node renderer's `onContextMenu`.

**Ref methods** (`CanvasRef`) — accessed via ref callback (not `forwardRef`):

| Method | Signature | Description |
|--------|-----------|-------------|
| `fitView` | `(rects: NodeRect[], padding?: number) => void` | Smoothly zoom/pan to fit rectangles in view |
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
  onPointerDown?: (e: PointerEvent) => void
  onContextMenu?: (e: MouseEvent) => void
  children?: JSX.Element
}
```

Sizing model: `w` and `h` are **floors**, rendered as `min-width: ${w}px` and `min-height: ${h}px`. The node's div grows in both axes to fit content, so the border always encloses what is rendered inside. A `ResizeObserver` on the container updates the registered rect with the measured size after first layout, so edges and other consumers of `getNodeRects()` see the actual rendered dimensions rather than the layout hint. Layout algorithms should still pass measured leaf sizes via their `sizeOf` parameter so parent packing is accurate, but the visible border is no longer at risk of clipping content.

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

## Edges

### EdgeDeclaration

Declarative edge passed via `<Canvas edges={...}>`. Cactus owns geometry; the host declares connectivity and optional styling hints.

```typescript
interface EdgeDeclaration {
  id: string
  sourceId: string         // must match a registered NodeContainer nodeId
  targetId: string
  styling?: EdgeStyling
  label?: () => JSX.Element  // rendered as <text> at the line midpoint
}

interface EdgeStyling {
  colorToken?: string      // CSS variable name without leading -- (e.g. 'accent', 'fg-muted')
  dash?: 'solid' | 'dashed' | 'dotted'
  width?: number           // default 1.5
  arrowHead?: boolean      // default false — triangle on target end
}
```

### Edge geometry

Edges currently render as **straight lines from source-node-center to target-node-center**. Endpoints are computed inside `EdgeLayer` as:

```
x1 = src.x + src.w / 2     x2 = tgt.x + tgt.w / 2
y1 = src.y + src.h / 2     y2 = tgt.y + tgt.h / 2
```

where `src`/`tgt` come from `ctx.getNodeRects()`. The visual consequence is that lines cross into the node's interior rather than terminating at its border — arrowheads land on the centerpoint, not on the edge of the box. Edge-intersection routing, curves, and container-avoidance are not implemented (see `TODO(routing)` in `EdgeLayer.tsx`). Endpoints recompute reactively whenever any `NodeContainer` re-registers its rect.

## Hooks

### Lifecycle summary

| Hook | Must be inside `<Canvas>`? | Reads `CanvasContext`? | Notes |
|------|----------------------------|------------------------|-------|
| `useViewport` | No (called by Canvas itself) | No | Direct use only when composing your own root |
| `useNodeDrag` | Recommended (reads zoom) | No (you pass `zoomScale`) | Pass result's `onPointerDown` to `NodeContainer` |
| `useNodeResize` | Recommended | No | Pair with `ResizeHandle` |
| `useConnectionDrag` | Recommended | No | Called by Canvas when `connectionDrag` prop is set |
| `useSelection` | Recommended | No (called internally by Canvas) | Selection already exposed via `useCanvasContext` |
| `useBoxSelect` | Yes | Yes (transform) | Activated by Shift+drag on background |
| `useKeyboardShortcuts` | No | No | Window-level listener |
| `useNodeLinks` | No | No | Pure lookup; no DOM/event side-effects |

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
