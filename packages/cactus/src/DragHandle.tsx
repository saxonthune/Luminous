import type { JSX } from 'solid-js';

export interface DragHandleProps {
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}

export function DragHandle(props: DragHandleProps): JSX.Element {
  return (
    <div
      data-drag-handle="true"
      data-no-pan="true"
      class={props.class}
      style={props.style}
    >
      {props.children}
    </div>
  );
}
