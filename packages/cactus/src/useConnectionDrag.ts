import { createSignal } from 'solid-js';
import { traceCallback, markInteraction } from './perf.js';

export interface ConnectionDragState {
  sourceNodeId: string;
  sourceHandle: string | null;
  /** Start position in canvas coordinates (zoom-invariant anchor) */
  startCanvasX: number;
  startCanvasY: number;
  /** Current cursor position in screen coordinates (updated each frame) */
  currentScreenX: number;
  currentScreenY: number;
}

export interface UseConnectionDragOptions {
  onConnect: (connection: {
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }) => void;
  isValidConnection?: (connection: {
    source: string;
    sourceHandle: string | null;
    target: string;
    targetHandle: string | null;
  }) => boolean;
  /** Convert screen coords to canvas coords (for zoom-invariant start anchor) */
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
}

export interface UseConnectionDragResult {
  connectionDrag: () => ConnectionDragState | null;
  startConnection: (sourceNodeId: string, sourceHandle: string | null, clientX: number, clientY: number) => void;
}

export function useConnectionDrag({
  onConnect,
  isValidConnection,
  screenToCanvas,
}: UseConnectionDragOptions): UseConnectionDragResult {
  const [connectionDrag, setConnectionDrag] = createSignal<ConnectionDragState | null>(null);

  const tracedOnConnect = import.meta.env.DEV
    ? traceCallback('onConnect', onConnect)
    : onConnect;

  const startConnection = (
    sourceNodeId: string,
    sourceHandle: string | null,
    clientX: number,
    clientY: number
  ) => {
    const canvasStart = screenToCanvas(clientX, clientY);
    setConnectionDrag({
      sourceNodeId,
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
      setConnectionDrag((prev) => {
        if (!prev) return prev;
        if (prev.currentScreenX === latestX && prev.currentScreenY === latestY) return prev;
        return { ...prev, currentScreenX: latestX, currentScreenY: latestY };
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
          const connection = {
            source: sourceNodeId,
            sourceHandle,
            target: targetNodeId,
            targetHandle: targetHandleId ?? null,
          };

          const isValid = isValidConnection ? isValidConnection(connection) : true;
          if (isValid) {
            tracedOnConnect(connection);
          }
        }
      }

      if (import.meta.env.DEV) connectMark?.end();
      setConnectionDrag(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return { connectionDrag, startConnection };
}
