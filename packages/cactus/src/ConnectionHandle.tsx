import type { JSX } from 'solid-js';

export interface ConnectionHandleProps {
  type: 'source' | 'target';
  id?: string;
  nodeId: string;
  style?: JSX.CSSProperties;
  class?: string;
  children?: JSX.Element;
  onStartConnection?: (nodeId: string, handleId: string | null, clientX: number, clientY: number) => void;
}

export function ConnectionHandle(props: ConnectionHandleProps): JSX.Element {
  let el: HTMLDivElement | undefined;

  const handlePointerDown = (event: PointerEvent) => {
    if (props.type === 'source' && props.onStartConnection) {
      event.stopPropagation();
      if (el) {
        const rect = el.getBoundingClientRect();
        props.onStartConnection(props.nodeId, props.id ?? null, rect.right, rect.top + rect.height / 2);
      } else {
        props.onStartConnection(props.nodeId, props.id ?? null, event.clientX, event.clientY);
      }
    }
  };

  return (
    <div
      ref={el}
      style={props.style}
      class={props.class}
      onPointerDown={props.type === 'source' ? handlePointerDown : undefined}
      {...(props.type === 'target'
        ? {
            'data-connection-target': 'true',
            'data-node-id': props.nodeId,
            ...(props.id ? { 'data-handle-id': props.id } : {}),
          }
        : {
            'data-no-pan': 'true',
          })}
    >
      {props.children}
    </div>
  );
}
