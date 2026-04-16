import type { JSX } from 'solid-js';
import { useCanvasContext } from './CanvasContext.js';
import { ConnectionHandle } from './ConnectionHandle.js';
import type { ResizeDirection } from './useNodeResize.js';

export interface NodeShellProps {
  nodeId: string;
  x: () => number;
  y: () => number;
  w: () => number;
  h: () => number;
  onDragPointerDown: (nodeId: string, event: PointerEvent) => void;
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
  onContextMenu?: (event: MouseEvent) => void;
  children?: JSX.Element;
}

export function NodeShell(props: NodeShellProps): JSX.Element {
  const { startConnection, isSelected, onNodePointerDown } = useCanvasContext();

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
        'box-shadow': 'var(--shadow-sm)',
      }}
      class={`bg-surface rounded-lg flex flex-col select-none ${
        isSelected(props.nodeId)
          ? 'outline outline-2 outline-accent-subtle border-transparent'
          : 'border border-border'
      }`}
      onPointerDown={(e) => {
        onNodePointerDown(props.nodeId, e);
        props.onDragPointerDown(props.nodeId, e);
      }}
      onContextMenu={props.onContextMenu}
    >
      <div
        data-drag-handle="true"
        class="h-5 bg-surface-alt rounded-t-lg cursor-grab active:cursor-grabbing border-b border-border-subtle flex items-center justify-center shrink-0"
      >
        <div class="w-8 h-0.5 bg-fg-subtle rounded-full" />
      </div>

      {props.children}

      <ConnectionHandle
        type="source"
        nodeId={props.nodeId}
        onStartConnection={startConnection}
        class="absolute top-1/2 w-3 h-3 rounded-full bg-accent-subtle border-2 border-surface shadow-sm cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
        style={{ right: '-6px', transform: 'translateY(-50%)' }}
      />

      <div
        data-no-pan="true"
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-40 hover:opacity-80 transition-opacity rounded-br-lg"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, var(--resize-handle) 50%)',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          props.onResizePointerDown(props.nodeId, { horizontal: 'right', vertical: 'bottom' }, e);
        }}
      />
    </div>
  );
}
