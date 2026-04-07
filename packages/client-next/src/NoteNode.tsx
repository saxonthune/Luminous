import { createSignal, createEffect, Show, type JSX } from 'solid-js';
import { NodeShell } from '@luminous/cactus';
import type { ResizeDirection } from '@luminous/cactus';
import type { Note } from './api';
import { MarkdownEditor } from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';

interface NoteNodeProps {
  note: Note;
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
    <NodeShell
      nodeId={props.note.id}
      x={() => merged()?.x ?? props.note.x}
      y={() => merged()?.y ?? props.note.y}
      w={() => merged()?.w ?? props.note.w}
      h={() => merged()?.h ?? props.note.h}
      onDragPointerDown={props.onDragPointerDown}
      onResizePointerDown={props.onResizePointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
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
    </NodeShell>
  );
}
