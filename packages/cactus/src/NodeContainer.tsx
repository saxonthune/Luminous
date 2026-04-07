import type { JSX } from 'solid-js';

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
  return (
    <div
      data-node-id={props.nodeId}
      data-drop-target="true"
      data-container-id={props.nodeId}
      data-connection-target="true"
      data-no-pan="true"
      style={{
        position: 'absolute',
        left: `${props.x()}px`,
        top: `${props.y()}px`,
        width: `${props.w()}px`,
        'min-height': `${props.h()}px`,
      }}
      onPointerDown={props.onPointerDown}
      onContextMenu={props.onContextMenu}
    >
      {props.children}
    </div>
  );
}
