---
title: Cactus API Contract
status: active
summary: Complete public API reference for the cactus canvas engine — components, hooks, types, and geometry utilities
tags: [cactus, canvas, api, components, hooks, types]
deps: [doc01.02.05.01]
---

# Cactus API Contract

Public API of the cactus canvas engine (`packages/cactus/src/`). Everything exported from the barrel `index.ts` is documented here. Internal modules are not part of the contract.

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
  renderEdges?: (transform: Transform) => JSX.Element
  renderConnectionPreview?: (coords: ConnectionPreviewCoords, transform: Transform) => JSX.Element
  renderBackground?: (transform: Transform, patternId?: string) => JSX.Element
  onBackgroundPointerDown?: (event: PointerEvent) => void
  className?: string
  patternId?: string
  children: JSX.Element
  ref?: (el: CanvasRef) => void
}
```

**Ref methods** (`CanvasRef`) — accessed via ref callback (not `forwardRef`):

| Method | Signature | Description |
|--------|-----------|-------------|
| `fitView` | `(rects: NodeRect[], padding?: number) => void` | Smoothly zoom/pan to fit rectangles in view |
| `screenToCanvas` | `(screenX, screenY) => {x, y}` | Convert screen coordinates to canvas space |
| `getTransform` | `() => Transform` | Current viewport transform |
| `zoomIn` | `() => void` | Zoom in 1.15x with 300ms animation |
| `zoomOut` | `() => void` | Zoom out 1/1.15x with 300ms animation |
| `clearSelection` | `() => void` | Deselect all nodes |

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

## Hooks

### useViewport

Manages pan/zoom via d3-zoom. Returns a container ref and programmatic controls.

```typescript
interface UseViewportOptions {
  minZoom?: number   // default 0.15
  maxZoom?: number   // default 2
}

function useViewport(options?: UseViewportOptions): {
  transform: Accessor<Transform>
  containerRef: (el: HTMLDivElement) => void
  fitView: (rects: NodeRect[], padding?: number) => void
  zoomIn: () => void
  zoomOut: () => void
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
}
```

### useNodeDrag

Manages node dragging. Converts screen deltas to canvas deltas (zoom-aware). Left button only.

```typescript
interface UseNodeDragOptions {
  zoomScale: number
  handleSelector?: string        // CSS selector to restrict drag initiation
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

Deltas are cumulative from drag start (not frame-to-frame). Apply as `basePosition + delta`.

### useNodeResize

Manages node resizing via corner/edge handles. Direction-aware: dragging a left edge produces negative `deltaWidth`.

```typescript
type ResizeDirection = {
  horizontal: 'left' | 'right' | 'none'
  vertical: 'top' | 'bottom' | 'none'
}

interface UseNodeResizeOptions {
  zoomScale: number
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
}

function useCanvasContext(): CanvasContextValue  // throws if outside Canvas
```

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
function computeAttach(nodeId: string, containerId: string, nodes: ContainerNode[]): { x: number; y: number }
function computeDetach(nodeId: string, nodes: ContainerNode[]): { x: number; y: number }
function computeContainerFit(childGeometries: NodeGeometry[], config?: ContainerFitConfig): OrganizerFitResult
```

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

## CSS Variables

The engine references these CSS custom properties:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `--color-accent` | ConnectionPreview, box-select | Primary interaction color |
| `--color-accent-10` | Box-select overlay | Accent at 10% opacity |
| `--color-dot-grid` | DotGrid, CrossGrid | Grid pattern color |
| `--color-surface` | EdgeLabel | Label background |
