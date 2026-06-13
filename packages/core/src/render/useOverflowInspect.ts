import { createSignal, onCleanup } from 'solid-js';
import type { RenderContext } from '../types.ts';

export interface OverflowInspect {
  overflowed: () => boolean;
  setRef: (el: HTMLElement) => void;
  onMouseDown: (e: MouseEvent) => void;
  onClick: (e: MouseEvent) => void;
}

/**
 * Detects whether a DOM element's content overflows its visible box and wires
 * a click-to-inspect handler. Includes a 4px drag-distance guard so dragging
 * a node from its description area does not accidentally open the inspector.
 */
export function useOverflowInspect(ctx: RenderContext): OverflowInspect {
  const [overflowed, setOverflowed] = createSignal(false);
  let downX = 0;
  let downY = 0;

  function check(el: HTMLElement): void {
    setOverflowed(el.scrollHeight > el.clientHeight);
  }

  function setRef(el: HTMLElement): void {
    check(el);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => check(el));
      ro.observe(el);
      onCleanup(() => ro.disconnect());
    }
  }

  function onMouseDown(e: MouseEvent): void {
    downX = e.clientX;
    downY = e.clientY;
  }

  function onClick(e: MouseEvent): void {
    if (!overflowed()) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    // Ignore if pointer moved more than 4px — treat as drag, not click.
    if (dx * dx + dy * dy > 16) return;
    const nodeId = ctx.currentNodeId?.();
    if (nodeId != null) {
      e.stopPropagation();
      ctx.inspect(nodeId);
    }
  }

  return { overflowed, setRef, onMouseDown, onClick };
}
