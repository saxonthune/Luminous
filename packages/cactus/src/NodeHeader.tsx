import { createRenderEffect, onCleanup, onMount, createSignal, type JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';

export interface NodeHeaderProps {
  /** The node this header belongs to. Required for registering measured height. */
  nodeId: string;
  /** Optional inline padding around the header content. */
  padding?: number | string;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

export function NodeHeader(props: NodeHeaderProps): JSX.Element {
  const ctx = useCanvasContext();
  const [measured, setMeasured] = createSignal<number | null>(null);
  let el: HTMLDivElement | undefined;

  createRenderEffect(() => {
    const h = measured();
    if (h !== null && h > 0) {
      ctx.registerHeaderHeight(props.nodeId, h);
    }
  });
  // Unregister only on component destruction — not on every effect re-run.
  // (See NodeContainer for why an in-effect onCleanup breaks layout.)
  onCleanup(() => ctx.unregisterHeaderHeight(props.nodeId));

  onMount(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setMeasured(h);
      }
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  const toLen = (v: number | string | undefined, fallback: string) =>
    typeof v === 'number' ? `${v}px` : (v ?? fallback);

  return (
    <div
      ref={(node) => { el = node; }}
      class={props.class}
      style={{
        padding: toLen(props.padding, '0'),
        'box-sizing': 'border-box',
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}
