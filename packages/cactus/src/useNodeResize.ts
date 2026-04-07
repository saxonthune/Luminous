import { createSignal } from 'solid-js';

export interface ResizeDirection {
  horizontal: 'left' | 'right' | 'none';
  vertical: 'top' | 'bottom' | 'none';
}

export interface NodeResizeCallbacks {
  onResizeStart?: (nodeId: string, direction: ResizeDirection) => void;
  onResize?: (nodeId: string, deltaWidth: number, deltaHeight: number, direction: ResizeDirection) => void;
  onResizeEnd?: (nodeId: string) => void;
}

export interface UseNodeResizeOptions {
  /** Current zoom scale — accessor for reactive updates */
  zoomScale: () => number;
  callbacks: NodeResizeCallbacks;
}

export interface UseNodeResizeResult {
  resizingNodeId: () => string | null;
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
}

export function useNodeResize(options: UseNodeResizeOptions): UseNodeResizeResult {
  const [resizingNodeId, setResizingNodeId] = createSignal<string | null>(null);
  let resizeStart: { x: number; y: number; direction: ResizeDirection } | null = null;

  const onResizePointerDown = (nodeId: string, direction: ResizeDirection, event: PointerEvent) => {
    event.stopPropagation();
    resizeStart = { x: event.clientX, y: event.clientY, direction };
    setResizingNodeId(nodeId);
    options.callbacks.onResizeStart?.(nodeId, direction);

    const handlePointerMove = (e: PointerEvent) => {
      if (!resizeStart) return;
      const k = options.zoomScale();
      const dx = (e.clientX - resizeStart.x) / k;
      const dy = (e.clientY - resizeStart.y) / k;

      let deltaWidth = 0;
      let deltaHeight = 0;
      if (resizeStart.direction.horizontal === 'right') deltaWidth = dx;
      else if (resizeStart.direction.horizontal === 'left') deltaWidth = -dx;
      if (resizeStart.direction.vertical === 'bottom') deltaHeight = dy;
      else if (resizeStart.direction.vertical === 'top') deltaHeight = -dy;

      options.callbacks.onResize?.(nodeId, deltaWidth, deltaHeight, resizeStart.direction);
    };

    const handlePointerUp = () => {
      options.callbacks.onResizeEnd?.(nodeId);
      setResizingNodeId(null);
      resizeStart = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return { resizingNodeId, onResizePointerDown };
}
