import type { JSX } from 'solid-js';
import type { ResizeDirection } from './interactions/useNodeResize.js';

export interface ResizeHandleProps {
  nodeId: string;
  direction?: ResizeDirection;
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
}

export function ResizeHandle(props: ResizeHandleProps): JSX.Element {
  const direction = (): ResizeDirection =>
    props.direction ?? { horizontal: 'right', vertical: 'bottom' };

  return (
    <>
      <div
        data-no-pan="true"
        class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
        style={{ 'pointer-events': 'auto' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          props.onResizePointerDown(props.nodeId, direction(), e);
        }}
      />
      <div
        class="absolute bottom-0 right-0 w-1 h-1 opacity-40 hover:opacity-80 transition-opacity rounded-br-lg"
        style={{
          'pointer-events': 'none',
          width: '16px',
          height: '16px',
          background: 'linear-gradient(135deg, transparent 50%, var(--cactus-resize-handle, #94a3b8) 50%)',
        }}
      />
    </>
  );
}
