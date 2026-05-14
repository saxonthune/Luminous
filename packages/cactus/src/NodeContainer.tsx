import { createRenderEffect, onCleanup, type JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';

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
  const ctx = useCanvasContext();

  // createRenderEffect runs synchronously during the render pass so that
  // node rects are registered before the EdgeLayer (which comes after in
  // the Canvas JSX) reads them for geometry computation.
  createRenderEffect(() => {
    ctx.registerNodeRect(props.nodeId, {
      x: props.x(),
      y: props.y(),
      w: props.w(),
      h: props.h(),
    });
    onCleanup(() => ctx.unregisterNodeRect(props.nodeId));
  });

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
      {/* Universal drag gripper — bottom-left corner, always present */}
      <div
        data-drag-handle="true"
        data-no-pan="true"
        class="absolute bottom-0 left-0 w-4 h-4 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-70 transition-opacity rounded-bl-lg"
        style={{ 'pointer-events': 'auto' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" style={{ 'pointer-events': 'none' }}>
          <line x1="3" y1="8" x2="8" y2="3" stroke="var(--resize-handle, #888)" stroke-width="1.5" stroke-linecap="round" />
          <line x1="3" y1="12" x2="12" y2="3" stroke="var(--resize-handle, #888)" stroke-width="1.5" stroke-linecap="round" />
          <line x1="7" y1="12" x2="12" y2="7" stroke="var(--resize-handle, #888)" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </div>
    </div>
  );
}
