import { createRenderEffect, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';

export interface NodeContainerProps {
  nodeId: string;
  x: () => number;
  y: () => number;
  w: () => number;
  h: () => number;
  onPointerDown?: (e: PointerEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  children?: JSX.Element;
}

export function NodeContainer(props: NodeContainerProps): JSX.Element {
  const ctx = useCanvasContext();
  // Measured size from ResizeObserver. While null, registered rect uses the hint
  // sizes from props.w()/props.h(); once observed, the actual rendered size wins so
  // edges, drag handles, and the border always agree with what the user sees.
  const [measured, setMeasured] = createSignal<{ w: number; h: number } | null>(null);
  let divEl: HTMLDivElement | undefined;

  // createRenderEffect runs synchronously during the render pass so that
  // node rects are registered before the EdgeLayer (which comes after in
  // the Canvas JSX) reads them for geometry computation.
  createRenderEffect(() => {
    const m = measured();
    ctx.registerNodeRect(props.nodeId, {
      x: props.x(),
      y: props.y(),
      w: m ? m.w : props.w(),
      h: m ? m.h : props.h(),
    });
    onCleanup(() => ctx.unregisterNodeRect(props.nodeId));
  });

  onMount(() => {
    if (!divEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const r = entry.contentRect;
        // Guard against 0x0 reports (common in jsdom / before first layout) —
        // a degenerate measured size would collapse edges into a single point.
        if (r.width > 0 && r.height > 0) {
          setMeasured({ w: r.width, h: r.height });
        }
      }
    });
    ro.observe(divEl);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div
      ref={(el) => {
        divEl = el;
      }}
      data-node-id={props.nodeId}
      data-drop-target="true"
      data-container-id={props.nodeId}
      data-connection-target="true"
      data-no-pan="true"
      style={{
        position: 'absolute',
        left: `${props.x()}px`,
        top: `${props.y()}px`,
        'min-width': `${props.w()}px`,
        'min-height': `${props.h()}px`,
      }}
      onPointerDown={(e) => props.onPointerDown?.(e)}
      onContextMenu={(e) => props.onContextMenu?.(e)}
    >
      {props.children}
    </div>
  );
}
