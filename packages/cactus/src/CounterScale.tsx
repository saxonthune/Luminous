import { createEffect, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
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

export interface CounterScaleCapacity {
  width: number;
  height: number;
}

export interface CounterScaleSlotStateInput extends CounterScaleCapacity {
  zoom: number;
  minScreenWidth?: number;
  minScreenHeight?: number;
  hysteresis?: number;
  wasVisible?: boolean;
  referenceZoom?: number;
  minScale?: number;
  maxScale?: number;
}

export interface CounterScaleSlotState {
  scale: number;
  screenWidth: number;
  screenHeight: number;
  visible: boolean;
}

export interface CounterScaleSlotProps extends Omit<CounterScaleProps, 'class' | 'style'> {
  /** Minimum projected allocation required to retain this semantic unit. */
  minScreenWidth?: number;
  minScreenHeight?: number;
  /** Screen-pixel gap between the exit and re-entry thresholds. */
  hysteresis?: number;
  /** Optional canvas-space allocation. The Slot measures itself when omitted. */
  capacity?: () => CounterScaleCapacity;
  /** Additional host eligibility, such as an exact semantic handoff boundary. */
  active?: () => boolean;
  /** Clip counter-scaled content to the Slot's layout allocation. */
  clip?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
  contentClass?: string;
  contentStyle?: JSX.CSSProperties;
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

/** Pure screen-capacity and hysteresis calculation shared by the Slot and tests. */
export function counterScaleSlotState(input: CounterScaleSlotStateInput): CounterScaleSlotState {
  const zoom = Math.max(0, input.zoom);
  const screenWidth = Math.max(0, input.width) * zoom;
  const screenHeight = Math.max(0, input.height) * zoom;
  const hysteresis = Math.max(0, input.hysteresis ?? 0);
  const margin = input.wasVisible === false ? hysteresis : -hysteresis;
  const requiredWidth = Math.max(0, (input.minScreenWidth ?? 0) + margin);
  const requiredHeight = Math.max(0, (input.minScreenHeight ?? 0) + margin);
  return {
    scale: counterScaleFactor(
      zoom,
      input.referenceZoom,
      input.minScale,
      input.maxScale,
    ),
    screenWidth,
    screenHeight,
    visible: screenWidth >= requiredWidth && screenHeight >= requiredHeight,
  };
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

/**
 * Gives a host-rendered semantic unit an explicit layout allocation. The unit
 * counter-scales as one visual and remains mounted, but becomes non-visible and
 * non-interactive once the allocation projects below its screen-size floor.
 */
export function CounterScaleSlot(props: CounterScaleSlotProps): JSX.Element {
  const canvas = useCanvasContext();
  const [measured, setMeasured] = createSignal<CounterScaleCapacity>({ width: 0, height: 0 });
  const [visible, setVisible] = createSignal(true);
  let slotEl!: HTMLDivElement;

  const capacity = () => props.capacity?.() ?? measured();
  const state = () => counterScaleSlotState({
    ...capacity(),
    zoom: canvas.transform().k,
    minScreenWidth: props.minScreenWidth,
    minScreenHeight: props.minScreenHeight,
    hysteresis: props.hysteresis,
    wasVisible: visible(),
    referenceZoom: props.referenceZoom,
    minScale: props.minScale,
    maxScale: props.maxScale,
  });

  createEffect(() => {
    const next = props.active?.() === false ? false : state().visible;
    if (next !== visible()) setVisible(next);
  });

  onMount(() => {
    if (props.capacity) return;
    const measure = () => setMeasured({ width: slotEl.clientWidth, height: slotEl.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setMeasured({ width: rect.width, height: rect.height });
    });
    observer.observe(slotEl);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={slotEl}
      data-cactus-counter-scale-slot
      data-cactus-counter-scale-visible={visible() ? 'true' : 'false'}
      class={props.class}
      style={{
        position: 'relative',
        'min-width': '0',
        overflow: props.clip === false ? 'visible' : 'hidden',
        ...props.style,
        visibility: visible() ? 'visible' : 'hidden',
        'pointer-events': visible() ? 'auto' : 'none',
      }}
    >
      <CounterScale
        referenceZoom={props.referenceZoom}
        minScale={props.minScale}
        maxScale={props.maxScale}
        origin={props.origin}
        enabled={props.enabled}
        class={props.contentClass}
        style={props.contentStyle}
      >
        {props.children}
      </CounterScale>
    </div>
  );
}
