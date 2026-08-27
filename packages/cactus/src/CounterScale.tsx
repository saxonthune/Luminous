import type { JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';

export interface CounterScaleProps {
  /** Camera scale at which the content renders at its authored size. */
  referenceZoom?: number;
  /** Bounds for the local inverse-scale factor. */
  minScale?: number;
  maxScale?: number;
  /** Transform anchor. Default: `top left`. */
  origin?: JSX.CSSProperties['transform-origin'];
  enabled?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

/** Pure scale calculation shared by the component and unit tests. */
export function counterScaleFactor(
  zoom: number,
  referenceZoom = 1,
  minScale = 1,
  maxScale = Number.POSITIVE_INFINITY,
): number {
  const safeZoom = Math.max(zoom, Number.EPSILON);
  const lower = Math.min(minScale, maxScale);
  const upper = Math.max(minScale, maxScale);
  return Math.min(upper, Math.max(lower, referenceZoom / safeZoom));
}

/**
 * Keeps a host-rendered subtree legible inside the geometrically scaled graph.
 * The transform is visual only: it neither changes Node layout nor participates
 * in collision placement. Use Visual LOD when content must escape or coordinate.
 */
export function CounterScale(props: CounterScaleProps): JSX.Element {
  const canvas = useCanvasContext();
  const scale = () => props.enabled === false
    ? 1
    : counterScaleFactor(
      canvas.transform().k,
      props.referenceZoom ?? 1,
      props.minScale ?? 1,
      props.maxScale ?? Number.POSITIVE_INFINITY,
    );

  return (
    <div
      data-cactus-counter-scale
      class={props.class}
      style={{
        display: 'inline-block',
        ...props.style,
        transform: `scale(${scale()})`,
        'transform-origin': props.origin ?? 'top left',
      }}
    >
      {props.children}
    </div>
  );
}
