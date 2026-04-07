import { createSignal } from 'solid-js';

export interface NodeDragCallbacks {
  onDragStart?: (nodeId: string, event: PointerEvent) => void;
  onDrag?: (nodeId: string, deltaX: number, deltaY: number) => void;
  onDragEnd?: (nodeId: string) => void;
}

export interface UseNodeDragOptions {
  /** Current zoom scale — accessor for reactive updates */
  zoomScale: () => number;
  /** CSS selector for the drag handle within each node. If omitted, entire node is draggable. */
  handleSelector?: string;
  callbacks: NodeDragCallbacks;
}

export interface UseNodeDragResult {
  /** Currently dragging node ID, or null — signal accessor */
  draggingNodeId: () => string | null;
  /** Attach to each node's onPointerDown */
  onPointerDown: (nodeId: string, event: PointerEvent) => void;
}

export function useNodeDrag(options: UseNodeDragOptions): UseNodeDragResult {
  const [draggingNodeId, setDraggingNodeId] = createSignal<string | null>(null);
  let dragStart: { x: number; y: number } | null = null;

  const onPointerDown = (nodeId: string, event: PointerEvent) => {
    if (event.button !== 0) return;

    if (options.handleSelector) {
      const target = event.target as HTMLElement;
      if (!target.closest(options.handleSelector)) return;
    }

    event.stopPropagation();
    dragStart = { x: event.clientX, y: event.clientY };
    setDraggingNodeId(nodeId);
    options.callbacks.onDragStart?.(nodeId, event);

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStart) return;
      const k = options.zoomScale();
      const cumulativeX = (e.clientX - dragStart.x) / k;
      const cumulativeY = (e.clientY - dragStart.y) / k;
      options.callbacks.onDrag?.(nodeId, cumulativeX, cumulativeY);
    };

    const handlePointerUp = () => {
      options.callbacks.onDragEnd?.(nodeId);
      setDraggingNodeId(null);
      dragStart = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return { draggingNodeId, onPointerDown };
}
