import type { JSX } from 'solid-js';
import { CounterScale } from './CounterScale.js';

export type ScreenSpaceHorizontalAnchor = 'left' | 'center' | 'right';
export type ScreenSpaceVerticalAnchor = 'top' | 'center' | 'bottom';

export interface ScreenSpaceAnchorProps {
  x: () => number;
  y: () => number;
  width: number | (() => number);
  height: number | (() => number);
  horizontal?: ScreenSpaceHorizontalAnchor;
  vertical?: ScreenSpaceVerticalAnchor;
  zIndex?: number | (() => number);
  visible?: () => boolean;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

function valueOf(value: number | (() => number)): number {
  return typeof value === 'function' ? value() : value;
}

/** Local offset whose aligned point remains on the world anchor while the
 * visual counter-scales around that same point. */
export function screenSpaceAnchorOffset(
  width: number,
  height: number,
  horizontal: ScreenSpaceHorizontalAnchor = 'center',
  vertical: ScreenSpaceVerticalAnchor = 'center',
): { left: number; top: number; origin: string } {
  const left = horizontal === 'left' ? 0 : horizontal === 'center' ? -width / 2 : -width;
  const top = vertical === 'top' ? 0 : vertical === 'center' ? -height / 2 : -height;
  return { left, top, origin: `${horizontal} ${vertical}` };
}

/** A fixed-screen visual attached to a canvas-space point. The zero-size outer
 * anchor follows graph geometry; its child inversely scales around the declared
 * alignment and remains outside Node clipping. */
export function ScreenSpaceAnchor(props: ScreenSpaceAnchorProps): JSX.Element {
  const width = () => valueOf(props.width);
  const height = () => valueOf(props.height);
  const offset = () => screenSpaceAnchorOffset(
    width(),
    height(),
    props.horizontal,
    props.vertical,
  );
  const zIndex = () => typeof props.zIndex === 'function' ? props.zIndex() : props.zIndex;

  return (
    <div
      data-cactus-screen-space-anchor
      style={{
        position: 'absolute',
        left: `${props.x()}px`,
        top: `${props.y()}px`,
        width: '0',
        height: '0',
        overflow: 'visible',
        'pointer-events': 'none',
        'z-index': zIndex(),
        visibility: props.visible?.() === false ? 'hidden' : 'visible',
      }}
    >
      <CounterScale
        minScale={0}
        origin={offset().origin}
        class={props.class}
        style={{
          position: 'absolute',
          left: `${offset().left}px`,
          top: `${offset().top}px`,
          width: `${width()}px`,
          height: `${height()}px`,
          'pointer-events': props.visible?.() === false ? 'none' : 'auto',
          ...props.style,
        }}
      >
        {props.children}
      </CounterScale>
    </div>
  );
}
