import { createSignal, onCleanup, type JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';

export type BoundarySide = 'top' | 'right' | 'bottom' | 'left';
export interface BoundaryPosition { side: BoundarySide; offset: number }
export interface BoundaryRect { x: number; y: number; w: number; h: number }

export function boundaryPoint(
  rect: BoundaryRect,
  position: BoundaryPosition,
  handleWidth = 0,
  handleHeight = 0,
): { x: number; y: number } {
  const horizontalInset = rect.w > 0 ? Math.min(0.5, handleWidth / 2 / rect.w) : 0.5;
  const verticalInset = rect.h > 0 ? Math.min(0.5, handleHeight / 2 / rect.h) : 0.5;
  if (position.side === 'top' || position.side === 'bottom') {
    const offset = Math.max(horizontalInset, Math.min(1 - horizontalInset, position.offset));
    return { x: rect.x + rect.w * offset, y: position.side === 'top' ? rect.y : rect.y + rect.h };
  }
  const offset = Math.max(verticalInset, Math.min(1 - verticalInset, position.offset));
  return { x: position.side === 'left' ? rect.x : rect.x + rect.w, y: rect.y + rect.h * offset };
}

/** Projects a canvas point to the nearest side. Ties follow top, right,
 * bottom, left order, which makes corner crossing stable and deterministic. */
export function projectToBoundary(rect: BoundaryRect, point: { x: number; y: number }): BoundaryPosition {
  const candidates = [
    { side: 'top' as const, distance: Math.abs(point.y - rect.y), offset: (point.x - rect.x) / rect.w },
    { side: 'right' as const, distance: Math.abs(point.x - rect.x - rect.w), offset: (point.y - rect.y) / rect.h },
    { side: 'bottom' as const, distance: Math.abs(point.y - rect.y - rect.h), offset: (point.x - rect.x) / rect.w },
    { side: 'left' as const, distance: Math.abs(point.x - rect.x), offset: (point.y - rect.y) / rect.h },
  ];
  const nearest = candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
  return { side: nearest.side, offset: Math.max(0, Math.min(1, nearest.offset)) };
}

export interface BoundaryHandleProps {
  rect: () => BoundaryRect;
  position: () => BoundaryPosition;
  width: number | (() => number);
  height: number | (() => number);
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
  onPreview?: (position: BoundaryPosition) => void;
  onCommit?: (position: BoundaryPosition) => void;
  onCancel?: () => void;
}

export function BoundaryHandle(props: BoundaryHandleProps): JSX.Element {
  const ctx = useCanvasContext();
  const [dragging, setDragging] = createSignal(false);
  let raf = 0;
  let latest: BoundaryPosition | undefined;

  onCleanup(() => { if (raf) cancelAnimationFrame(raf); });
  const width = () => typeof props.width === 'function' ? props.width() : props.width;
  const height = () => typeof props.height === 'function' ? props.height() : props.height;
  const point = () => boundaryPoint(props.rect(), props.position(), width(), height());

  function begin(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const update = (event: PointerEvent) => {
      if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) < 3) return;
      moved = true;
      setDragging(true);
      latest = projectToBoundary(props.rect(), ctx.screenToCanvas(event.clientX, event.clientY));
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        if (latest) props.onPreview?.(latest);
      });
    };
    const finish = (event: PointerEvent) => {
      update(event);
      if (!moved) {
        target.releasePointerCapture?.(e.pointerId);
        window.removeEventListener('pointermove', update);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        return;
      }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const final = latest ?? props.position();
      props.onPreview?.(final);
      props.onCommit?.(final);
      setDragging(false);
      target.releasePointerCapture?.(e.pointerId);
      window.removeEventListener('pointermove', update);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
    const cancel = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      setDragging(false);
      props.onCancel?.();
      window.removeEventListener('pointermove', update);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
    window.addEventListener('pointermove', update);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  }

  return (
    <div
      data-cactus-boundary-handle
      data-dragging={dragging() ? 'true' : undefined}
      data-no-pan="true"
      class={props.class}
      style={{
        position: 'absolute', left: `${point().x - width() / 2}px`, top: `${point().y - height() / 2}px`,
        width: `${width()}px`, height: `${height()}px`, 'pointer-events': 'auto', 'touch-action': 'none',
        ...props.style,
      }}
      on:pointerdown={begin}
      on:click={(e: MouseEvent) => e.stopPropagation()}
    >{props.children}</div>
  );
}
