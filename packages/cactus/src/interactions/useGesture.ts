import { createSignal, createSelector, onMount, onCleanup } from 'solid-js';
import type { Transform } from './useViewport.js';
import { rectsIntersect, type NodeRect } from './useBoxSelect.js';
import { traceCallback, markInteraction } from '../perf.js';
import { isOverContainerInterior } from '../geometry/containment.js';

export interface ResizeDirection {
  horizontal: 'left' | 'right' | 'none';
  vertical: 'top' | 'bottom' | 'none';
}

export type Gesture =
  | { kind: 'idle' }
  | { kind: 'pressing'; nodeId: string; startX: number; startY: number }
  | { kind: 'draggingNode'; nodeId: string; startX: number; startY: number; dx: number; dy: number }
  | { kind: 'marquee'; startX: number; startY: number; rect: { x: number; y: number; width: number; height: number } | null }
  | {
      kind: 'connecting';
      sourceId: string;
      sourceHandle: string | null;
      startCanvasX: number;
      startCanvasY: number;
      currentScreenX: number;
      currentScreenY: number;
    }
  | { kind: 'resizing'; nodeId: string; dir: ResizeDirection; startX: number; startY: number };

export interface ConnectionPayload {
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
}

/** Pointer must travel this far (screen px) before a press becomes a drag —
    the threshold that lets a click/double-click be told apart from a drag. */
export const DRAG_THRESHOLD = 3;

export interface GestureCallbacks {
  onDragStart?: (nodeId: string) => void;
  onDrag?: (nodeId: string, dx: number, dy: number) => void;
  onDragEnd?: (nodeId: string, dx: number, dy: number) => void;
  onResizeStart?: (nodeId: string, direction: ResizeDirection) => void;
  onResize?: (nodeId: string, deltaWidth: number, deltaHeight: number, direction: ResizeDirection) => void;
  onResizeEnd?: (nodeId: string) => void;
}

export interface UseGestureOptions {
  /** Current zoom scale — accessor for reactive updates */
  zoomScale: () => number;
  callbacks: GestureCallbacks;
  /** When provided, wires the marquee (box-select) lifecycle: a plain-left or
      shift-left press on the pan surface starts a `marquee` gesture. */
  boxSelect?: {
    /** Current viewport transform — accessor for reactive updates */
    transform: () => Transform;
    /** Container element accessor — the marquee listener binds here */
    containerEl: () => HTMLElement | undefined;
    /** Returns current node rects in canvas coordinates for hit-testing */
    getNodeRects: () => NodeRect[];
    /** 'shift-drag' (default) needs Shift held; 'drag' marquees on plain
        left-drag over the background and clears the selection on a plain
        background click. */
    trigger?: 'shift-drag' | 'drag';
    /** Called with hit node ids as the marquee rect changes */
    onBoxSelectHits?: (hitIds: string[]) => void;
  };
  /** When provided, wires the connection-drag lifecycle via `beginConnect`. */
  connection?: {
    /** Convert screen coords to canvas coords (zoom-invariant start anchor) */
    screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
    onConnect: (connection: ConnectionPayload) => void;
    isValidConnection?: (connection: ConnectionPayload) => boolean;
  };
}

export interface UseGestureResult {
  /** The current gesture — signal accessor */
  gesture: () => Gesture;
  /** Attach to a node's pointerdown to start the gesture */
  beginPress: (nodeId: string, event: PointerEvent) => void;
  /** True only for the node currently being dragged — createSelector-backed */
  isDraggingNode: (nodeId: string) => boolean;
  /** The active drag delta, canvas-space, `{0,0}` when idle */
  dragDelta: () => { dx: number; dy: number };
  /** Start a connection drag from a source handle */
  beginConnect: (sourceNodeId: string, sourceHandle: string | null, clientX: number, clientY: number) => void;
  /** Start a resize drag on a node from a resize handle */
  beginResize: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
}

const IDLE: Gesture = { kind: 'idle' };

export function useGesture(options: UseGestureOptions): UseGestureResult {
  const [gesture, setGesture] = createSignal<Gesture>(IDLE);

  const draggingId = () => {
    const g = gesture();
    return g.kind === 'draggingNode' ? g.nodeId : null;
  };
  const isDraggingNode = createSelector(draggingId);

  const dragDelta = () => {
    const g = gesture();
    return g.kind === 'draggingNode' ? { dx: g.dx, dy: g.dy } : { dx: 0, dy: 0 };
  };

  const beginPress = (nodeId: string, event: PointerEvent) => {
    if (event.button !== 0) return;

    const startX = event.clientX;
    const startY = event.clientY;
    setGesture({ kind: 'pressing', nodeId, startX, startY });

    const target = event.currentTarget as Element | null;
    let captured = false;

    const handlePointerMove = (e: PointerEvent) => {
      const g = gesture();
      if (g.kind === 'idle') return;

      const k = options.zoomScale();
      const rawDx = e.clientX - startX;
      const rawDy = e.clientY - startY;

      if (g.kind === 'pressing') {
        if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD) return;
        setGesture({ kind: 'draggingNode', nodeId, startX, startY, dx: rawDx / k, dy: rawDy / k });
        target?.setPointerCapture?.(event.pointerId);
        captured = true;
        options.callbacks.onDragStart?.(nodeId);
        return;
      }

      const dx = rawDx / k;
      const dy = rawDy / k;
      setGesture({ kind: 'draggingNode', nodeId, startX, startY, dx, dy });
      options.callbacks.onDrag?.(nodeId, dx, dy);
    };

    const handlePointerUp = () => {
      const g = gesture();
      if (g.kind === 'draggingNode') {
        options.callbacks.onDragEnd?.(g.nodeId, g.dx, g.dy);
      }
      setGesture(IDLE);
      if (captured) target?.releasePointerCapture?.(event.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const connection = options.connection;
  const tracedOnConnect = connection
    ? import.meta.env.DEV
      ? traceCallback('onConnect', connection.onConnect)
      : connection.onConnect
    : undefined;

  const beginConnect = (
    sourceNodeId: string,
    sourceHandle: string | null,
    clientX: number,
    clientY: number
  ) => {
    if (!connection) return;

    const canvasStart = connection.screenToCanvas(clientX, clientY);
    setGesture({
      kind: 'connecting',
      sourceId: sourceNodeId,
      sourceHandle,
      startCanvasX: canvasStart.x,
      startCanvasY: canvasStart.y,
      currentScreenX: clientX,
      currentScreenY: clientY,
    });

    let connectMark: { end: () => void } | undefined;
    if (import.meta.env.DEV) connectMark = markInteraction('connect');

    let latestX = clientX;
    let latestY = clientY;
    let rafId = 0;

    const flushPosition = () => {
      rafId = 0;
      setGesture((g) => {
        if (g.kind !== 'connecting') return g;
        if (g.currentScreenX === latestX && g.currentScreenY === latestY) return g;
        return { ...g, currentScreenX: latestX, currentScreenY: latestY };
      });
    };

    const handlePointerMove = (e: PointerEvent) => {
      latestX = e.clientX;
      latestY = e.clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(flushPosition);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (rafId) cancelAnimationFrame(rafId);

      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const targetElement = elements.find((el) =>
        el.hasAttribute('data-connection-target')
      ) as HTMLElement | undefined;

      if (targetElement) {
        const targetNodeId = targetElement.getAttribute('data-node-id');
        const targetHandleId = targetElement.getAttribute('data-handle-id');

        if (targetNodeId) {
          const payload: ConnectionPayload = {
            source: sourceNodeId,
            sourceHandle,
            target: targetNodeId,
            targetHandle: targetHandleId ?? null,
          };

          const isValid = connection.isValidConnection ? connection.isValidConnection(payload) : true;
          if (isValid) {
            tracedOnConnect!(payload);
          }
        }
      }

      if (import.meta.env.DEV) connectMark?.end();
      setGesture(IDLE);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const tracedOnResizeStart = import.meta.env.DEV && options.callbacks.onResizeStart
    ? traceCallback('onResizeStart', options.callbacks.onResizeStart)
    : options.callbacks.onResizeStart;
  const tracedOnResize = import.meta.env.DEV && options.callbacks.onResize
    ? traceCallback('onResize', options.callbacks.onResize)
    : options.callbacks.onResize;
  const tracedOnResizeEnd = import.meta.env.DEV && options.callbacks.onResizeEnd
    ? traceCallback('onResizeEnd', options.callbacks.onResizeEnd)
    : options.callbacks.onResizeEnd;

  const beginResize = (nodeId: string, dir: ResizeDirection, event: PointerEvent) => {
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    setGesture({ kind: 'resizing', nodeId, dir, startX, startY });
    tracedOnResizeStart?.(nodeId, dir);

    let resizeMark: { end: () => void } | undefined;
    if (import.meta.env.DEV) resizeMark = markInteraction('resize');

    const handlePointerMove = (e: PointerEvent) => {
      const g = gesture();
      if (g.kind !== 'resizing') return;
      const k = options.zoomScale();
      const dx = (e.clientX - g.startX) / k;
      const dy = (e.clientY - g.startY) / k;

      let deltaWidth = 0;
      let deltaHeight = 0;
      if (g.dir.horizontal === 'right') deltaWidth = dx;
      else if (g.dir.horizontal === 'left') deltaWidth = -dx;
      if (g.dir.vertical === 'bottom') deltaHeight = dy;
      else if (g.dir.vertical === 'top') deltaHeight = -dy;

      tracedOnResize?.(nodeId, deltaWidth, deltaHeight, g.dir);
    };

    const handlePointerUp = () => {
      tracedOnResizeEnd?.(nodeId);
      if (import.meta.env.DEV) resizeMark?.end();
      setGesture(IDLE);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const boxSelect = options.boxSelect;
  if (boxSelect) {
    onMount(() => {
      const container = boxSelect.containerEl();
      if (!container) return;

      const handleContainerPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        const trigger = boxSelect.trigger ?? 'shift-drag';
        if (trigger === 'shift-drag' && !e.shiftKey) return;

        const target = e.target as HTMLElement;
        if (target.closest?.('[data-no-pan]')) return;
        // A press inside some node's own box bails out, UNLESS it lands on
        // that node's `[data-soft-container]` interior (Atlas's container
        // body) — a container-interior press marquees instead of moving the
        // node. Dataflow's boxes have no soft-container interior, so
        // isOverContainerInterior is always false for them and this collapses
        // to the old "any node press bails" behavior.
        const nodeEl = target.closest?.('[data-container-id]');
        if (nodeEl && !isOverContainerInterior(nodeEl, e.clientX, e.clientY)) return;

        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startY = e.clientY;
        let moved = false;
        setGesture({ kind: 'marquee', startX, startY, rect: null });

        const handlePointerMove = (moveEvent: PointerEvent) => {
          moved = true;
          const currentX = moveEvent.clientX;
          const currentY = moveEvent.clientY;

          // Container-relative, so the rendered rect lines up when the canvas
          // doesn't start at the viewport origin (e.g. below an app header).
          const containerRect = container.getBoundingClientRect();
          const rect = {
            x: Math.min(startX, currentX) - containerRect.left,
            y: Math.min(startY, currentY) - containerRect.top,
            width: Math.abs(currentX - startX),
            height: Math.abs(currentY - startY),
          };
          setGesture({ kind: 'marquee', startX, startY, rect });

          const t = boxSelect.transform();
          const canvasRect = {
            x: (rect.x - t.x) / t.k,
            y: (rect.y - t.y) / t.k,
            width: rect.width / t.k,
            height: rect.height / t.k,
          };

          const nodeRects = boxSelect.getNodeRects();
          const hits = nodeRects
            .filter((nr) => rectsIntersect(canvasRect, nr))
            .map((nr) => nr.id);
          boxSelect.onBoxSelectHits?.(hits);
        };

        const handlePointerUp = () => {
          // A plain background click (no drag) clears the selection in 'drag' mode.
          if (!moved && trigger === 'drag') {
            boxSelect.onBoxSelectHits?.([]);
          }
          setGesture(IDLE);
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
      };

      container.addEventListener('pointerdown', handleContainerPointerDown);
      onCleanup(() => container.removeEventListener('pointerdown', handleContainerPointerDown));
    });
  }

  return { gesture, beginPress, isDraggingNode, dragDelta, beginConnect, beginResize };
}
