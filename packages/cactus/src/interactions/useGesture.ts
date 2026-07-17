import { createSignal, createSelector } from 'solid-js';

export type Gesture =
  | { kind: 'idle' }
  | { kind: 'pressing'; nodeId: string; startX: number; startY: number }
  | { kind: 'draggingNode'; nodeId: string; startX: number; startY: number; dx: number; dy: number };

/** Pointer must travel this far (screen px) before a press becomes a drag —
    the threshold that lets a click/double-click be told apart from a drag. */
export const DRAG_THRESHOLD = 3;

export interface GestureCallbacks {
  onDragStart?: (nodeId: string) => void;
  onDrag?: (nodeId: string, dx: number, dy: number) => void;
  onDragEnd?: (nodeId: string, dx: number, dy: number) => void;
}

export interface UseGestureOptions {
  /** Current zoom scale — accessor for reactive updates */
  zoomScale: () => number;
  callbacks: GestureCallbacks;
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
    target?.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (e: PointerEvent) => {
      const g = gesture();
      if (g.kind === 'idle') return;

      const k = options.zoomScale();
      const rawDx = e.clientX - startX;
      const rawDy = e.clientY - startY;

      if (g.kind === 'pressing') {
        if (Math.hypot(rawDx, rawDy) < DRAG_THRESHOLD) return;
        setGesture({ kind: 'draggingNode', nodeId, startX, startY, dx: rawDx / k, dy: rawDy / k });
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
      target?.releasePointerCapture?.(event.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return { gesture, beginPress, isDraggingNode, dragDelta };
}
