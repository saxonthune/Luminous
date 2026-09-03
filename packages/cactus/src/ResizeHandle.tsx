import type { JSX } from 'solid-js';
import type { ResizeDirection } from './interactions/useGesture.js';
import { ScreenSpaceAnchor } from './ScreenSpaceAnchor.js';

export interface ResizeHandleRect { x: number; y: number; w: number; h: number }

export interface ResizeHandleProps {
  nodeId: string;
  direction?: ResizeDirection;
  /** Canvas-space Node rectangle. When present, the handle renders outside the
   * Node as a fixed-size screen-space adornment at its bottom-right corner. */
  rect?: () => ResizeHandleRect;
  visible?: () => boolean;
  zIndex?: number | (() => number);
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
}

export function ResizeHandle(props: ResizeHandleProps): JSX.Element {
  const direction = (): ResizeDirection =>
    props.direction ?? { horizontal: 'right', vertical: 'bottom' };

  const handle = () => (
    <div
      data-cactus-resize-handle
      data-no-pan="true"
      class="h-full w-full cursor-se-resize rounded-br-lg"
      style={{
        'pointer-events': 'auto',
        background: 'linear-gradient(135deg, transparent 50%, var(--cactus-resize-handle, #94a3b8) 50%)',
      }}
      on:pointerdown={(e) => props.onResizePointerDown(props.nodeId, direction(), e)}
    />
  );

  if (props.rect) {
    return (
      <ScreenSpaceAnchor
        x={() => props.rect!().x + props.rect!().w}
        y={() => props.rect!().y + props.rect!().h}
        width={16}
        height={16}
        horizontal="right"
        vertical="bottom"
        zIndex={props.zIndex}
        visible={props.visible}
      >
        {handle()}
      </ScreenSpaceAnchor>
    );
  }

  return (
    <>
      <div
        data-no-pan="true"
        class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
        style={{ 'pointer-events': 'auto' }}
        on:pointerdown={(e) => props.onResizePointerDown(props.nodeId, direction(), e)}
      />
      <div
        data-cactus-resize-handle
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
