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

  const selected = () => isSelected(props.nodeId);

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
        'box-shadow': 'var(--cactus-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05))',
        background: 'var(--cactus-surface, #ffffff)',
        ...(selected()
          ? { 'outline-color': 'var(--cactus-accent-subtle, #3b82f6)' }
          : { 'border-color': 'var(--cactus-border, #e5e7eb)' }),
      }}
      class={`rounded-lg flex flex-col select-none ${
        selected() ? 'outline outline-2' : 'border'
      }`}
      onPointerDown={(e) => {
        onNodePointerDown(props.nodeId, e);
        props.onDragPointerDown(props.nodeId, e);
      }}
      onContextMenu={(e) => props.onContextMenu?.(e)}
    >
      <div
        data-drag-handle="true"
        class="h-5 rounded-t-lg cursor-grab active:cursor-grabbing border-b flex items-center justify-center shrink-0"
        style={{
          background: 'var(--cactus-surface-alt, #f3f4f6)',
          'border-color': 'var(--cactus-border-subtle, #f3f4f6)',
        }}
      >
        <div
          class="w-8 h-0.5 rounded-full"
          style={{ background: 'var(--cactus-fg-subtle, #9ca3af)' }}
        />
      </div>

      {props.children}

      <ConnectionHandle
        type="source"
        nodeId={props.nodeId}
        onStartConnection={startConnection}
        class="absolute top-1/2 w-3 h-3 rounded-full border-2 shadow-sm cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
        style={{
          right: '-6px',
          transform: 'translateY(-50%)',
          background: 'var(--cactus-accent-subtle, #3b82f6)',
          'border-color': 'var(--cactus-surface, #ffffff)',
        }}
      />

      <div
        data-no-pan="true"
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-40 hover:opacity-80 transition-opacity rounded-br-lg"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, var(--cactus-resize-handle, #94a3b8) 50%)',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          props.onResizePointerDown(props.nodeId, { horizontal: 'right', vertical: 'bottom' }, e);
        }}
      />
    </div>
  );
}
