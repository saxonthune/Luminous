import { createSignal, createEffect, Show, type JSX } from 'solid-js';
import { NodeContainer, DragHandle, ResizeHandle, ConnectionHandle, useCanvasContext } from '@luminous/cactus';
import type { ResizeDirection } from '@luminous/cactus';
import type { Note, NoteNode as NoteNodeType } from './api';
import { MarkdownEditor } from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';

interface NoteNodeProps {
  note: NoteNodeType;
  mergedNotes: () => Record<string, Note>;
  onDragPointerDown: (nodeId: string, event: PointerEvent) => void;
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: PointerEvent) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateBody: (id: string, body: string) => void;
  onDelete: (noteId: string) => void;
  onExtract: (noteId: string, selectedText: string, selectionFrom: number, selectionTo: number) => void;
  children?: JSX.Element;
}

export function NoteNode(props: NoteNodeProps) {
  const [localTitle, setLocalTitle] = createSignal(props.note.title);
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);
  let editorHandle: MarkdownEditorHandle | undefined;

  const { startConnection, isSelected, onNodePointerDown } = useCanvasContext();

  createEffect(() => setLocalTitle(props.note.title));

  const merged = () => props.mergedNotes()[props.note.id];

  const buildMenuItems = (): MenuItem[] => {
    const items: MenuItem[] = [];
    const selection = editorHandle?.getSelection();
    if (selection) {
      items.push({
        label: 'Extract to note',
        action: () => props.onExtract(props.note.id, selection.text, selection.from, selection.to),
      });
      items.push({ label: '', action: () => {}, separator: true });
    }
    items.push({
      label: 'Delete note',
      action: () => props.onDelete(props.note.id),
    });
    return items;
  };

  return (
    <NodeContainer
      nodeId={props.note.id}
      x={() => merged()?.x ?? props.note.x}
      y={() => merged()?.y ?? props.note.y}
      w={() => merged()?.w ?? props.note.w}
      h={() => merged()?.h ?? props.note.h}
      onPointerDown={(e) => {
        onNodePointerDown(props.note.id, e);
        props.onDragPointerDown(props.note.id, e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        class={`bg-[var(--bg-surface)] rounded-lg flex flex-col select-none ${
          isSelected(props.note.id)
            ? 'outline outline-2 outline-[var(--color-accent-subtle)] border-transparent'
            : 'border border-[var(--border-default)]'
        }`}
        style={{ 'box-shadow': 'var(--shadow-sm)', width: '100%', 'min-height': 'inherit' }}
      >
        <DragHandle class="h-5 bg-[var(--bg-surface-alt)] rounded-t-lg cursor-grab active:cursor-grabbing border-b border-[var(--border-subtle)] flex items-center justify-center shrink-0">
          <div class="w-8 h-0.5 bg-[var(--text-tertiary)] rounded-full" />
        </DragHandle>

        <input
          data-no-pan="true"
          class="w-full px-2 py-1 font-semibold text-sm outline-none bg-transparent border-b border-[var(--border-subtle)]"
          style={{ 'user-select': 'text' }}
          value={localTitle()}
          onInput={(e) => setLocalTitle(e.currentTarget.value)}
          onBlur={() => props.onUpdateTitle(props.note.id, localTitle())}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />

        <MarkdownEditor
          ref={(h) => (editorHandle = h)}
          value={props.note.body}
          minHeight={Math.max((merged()?.h ?? props.note.h) - 80, 40)}
          onChange={(body) => props.onUpdateBody(props.note.id, body)}
        />

        {props.children}

        <ConnectionHandle
          type="source"
          nodeId={props.note.id}
          onStartConnection={startConnection}
          class="absolute top-1/2 w-3 h-3 rounded-full bg-[var(--color-accent-subtle)] border-2 border-[var(--bg-surface)] shadow-sm cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
          style={{ right: '-6px', transform: 'translateY(-50%)' }}
        />

        <ResizeHandle
          nodeId={props.note.id}
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
