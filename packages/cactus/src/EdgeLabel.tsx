import type { JSX } from 'solid-js';

export interface EdgeLabelProps {
  x: number;
  y: number;
  children: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
  onContextMenu?: (event: MouseEvent) => void;
}

export function EdgeLabel(props: EdgeLabelProps): JSX.Element {
  const foWidth = 400;
  const foHeight = 60;

  return (
    <foreignObject
      x={props.x - foWidth / 2}
      y={props.y - foHeight / 2}
      width={foWidth}
      height={foHeight}
      style={{ overflow: 'visible', "pointer-events": 'none' }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          "align-items": 'center',
          "justify-content": 'center',
          "pointer-events": 'none',
        }}
      >
        <div
          class={props.class}
          style={{
            "pointer-events": props.onContextMenu ? 'auto' : 'none',
            cursor: props.onContextMenu ? 'context-menu' : undefined,
            "border-radius": '9999px',
            "padding-left": '8px',
            "padding-right": '8px',
            "padding-top": '2px',
            "padding-bottom": '2px',
            "background-color": 'color-mix(in srgb, var(--surface) 85%, transparent)',
            "backdrop-filter": 'blur(4px)',
            "user-select": 'none',
            "white-space": 'nowrap',
            ...props.style,
          }}
          onContextMenu={props.onContextMenu}
        >
          {props.children}
        </div>
      </div>
    </foreignObject>
  );
}
