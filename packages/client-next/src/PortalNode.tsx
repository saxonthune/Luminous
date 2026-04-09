import { createSignal, Show, type JSX } from 'solid-js';
import { NodeContainer, DragHandle, ResizeHandle, ConnectionHandle, useCanvasContext } from '@luminous/cactus';
import type { ResizeDirection } from '@luminous/cactus';
import type { Note, PortalNode as PortalNodeType } from './api';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';

interface PortalNodeProps {
  node: PortalNodeType;
  mergedNotes: () => Record<string, Note>;
  onDragPointerDown: (nodeId: string, event: PointerEvent) => void;
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
  onDelete: (nodeId: string) => void;
  children?: JSX.Element;
}

export function PortalNode(props: PortalNodeProps) {
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);

  const { startConnection, isSelected, onNodePointerDown } = useCanvasContext();

  const merged = () => props.mergedNotes()[props.node.id];

  const buildMenuItems = (): MenuItem[] => [
    {
      label: 'Delete portal',
      action: () => props.onDelete(props.node.id),
    },
  ];

  return (
    <NodeContainer
      nodeId={props.node.id}
      x={() => merged()?.x ?? props.node.x}
      y={() => merged()?.y ?? props.node.y}
      w={() => merged()?.w ?? props.node.w}
      h={() => merged()?.h ?? props.node.h}
      onPointerDown={(e) => {
        onNodePointerDown(props.node.id, e);
        props.onDragPointerDown(props.node.id, e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        class={`bg-[var(--bg-surface)] rounded-lg flex flex-col select-none ${
          isSelected(props.node.id)
            ? 'outline outline-2 outline-[var(--color-accent-subtle)] border-transparent'
            : 'border border-dashed border-[var(--border-default)]'
        }`}
        style={{ 'box-shadow': 'var(--shadow-sm)', width: '100%', 'min-height': 'inherit' }}
      >
        <DragHandle class="h-5 bg-[var(--bg-surface-alt)] rounded-t-lg cursor-grab active:cursor-grabbing border-b border-[var(--border-subtle)] flex items-center justify-center shrink-0">
          <div class="w-8 h-0.5 bg-[var(--text-tertiary)] rounded-full" />
        </DragHandle>

        <div class="px-2 py-1 font-semibold text-sm border-b border-[var(--border-subtle)] text-[var(--text-primary)]">
          {props.node.title || 'Untitled Portal'}
        </div>

        <div class="flex-1 flex items-center justify-center p-4">
          <div class="text-center">
            <div class="text-xs text-[var(--text-tertiary)] mb-1">Portal</div>
            <div class="text-sm text-[var(--text-secondary)] font-mono break-all">
              {props.node.canvasRef || '(no canvas ref)'}
            </div>
          </div>
        </div>

        {props.children}

        <ConnectionHandle
          type="source"
          nodeId={props.node.id}
          onStartConnection={startConnection}
          class="absolute top-1/2 w-3 h-3 rounded-full bg-[var(--color-accent-subtle)] border-2 border-[var(--bg-surface)] shadow-sm cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
          style={{ right: '-6px', transform: 'translateY(-50%)' }}
        />

        <ResizeHandle
          nodeId={props.node.id}
          onResizePointerDown={props.onResizePointerDown}
        />
      </div>

      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            x={menu().x}
            y={menu().y}
            items={buildMenuItems()}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>
    </NodeContainer>
  );
}
