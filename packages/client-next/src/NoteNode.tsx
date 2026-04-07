import React, { useState, useEffect, useRef } from 'react'
import { useCanvasContext, ConnectionHandle } from '@luminous/cactus'
import type { ResizeDirection } from '@luminous/cactus'
import type { Note } from './api'
import { MarkdownEditor } from './MarkdownEditor'
import type { MarkdownEditorHandle } from './MarkdownEditor'
import { ContextMenu } from './ContextMenu'
import type { MenuItem } from './ContextMenu'

interface NoteNodeProps {
  note: Note
  /** Visual x position (canvas or relative coords depending on nesting) */
  x: number
  /** Visual y position */
  y: number
  /** Visual width */
  w: number
  /** Visual height */
  h: number
  onDragPointerDown: (nodeId: string, event: React.PointerEvent) => void
  onResizePointerDown: (nodeId: string, direction: ResizeDirection, event: React.PointerEvent) => void
  onUpdateTitle: (id: string, title: string) => void
  onUpdateBody: (id: string, body: string) => void
  onDelete: (noteId: string) => void
  onExtract: (noteId: string, selectedText: string, selectionFrom: number, selectionTo: number) => void
  /** Nested NoteNode elements rendered absolutely within this note */
  children?: React.ReactNode
}

export function NoteNode({
  note,
  x,
  y,
  w,
  h,
  onDragPointerDown,
  onResizePointerDown,
  onUpdateTitle,
  onUpdateBody,
  onDelete,
  onExtract,
  children,
}: NoteNodeProps) {
  const { startConnection, isSelected, onNodePointerDown } = useCanvasContext()
  const [localTitle, setLocalTitle] = useState(note.title)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const editorRef = useRef<MarkdownEditorHandle>(null)

  // Sync when note title changes from server
  useEffect(() => setLocalTitle(note.title), [note.title])

  const selected = isSelected(note.id)

  const buildMenuItems = (): MenuItem[] => {
    const items: MenuItem[] = []

    const selection = editorRef.current?.getSelection()
    if (selection) {
      items.push({
        label: 'Extract to note',
        action: () => onExtract(note.id, selection.text, selection.from, selection.to),
      })
      items.push({ label: '', action: () => {}, separator: true })
    }

    items.push({
      label: 'Delete note',
      action: () => onDelete(note.id),
    })

    return items
  }

  return (
    <div
      data-node-id={note.id}
      data-drop-target="true"
      data-container-id={note.id}
      data-connection-target="true"
      data-no-pan="true"
      style={{ position: 'absolute', left: x, top: y, width: w, minHeight: h }}
      className={`bg-white rounded-lg shadow-sm flex flex-col select-none ${
        selected
          ? 'outline outline-2 outline-blue-500 border-transparent'
          : 'border border-gray-200'
      }`}
      onPointerDown={(e) => {
        onNodePointerDown(note.id, e)
        onDragPointerDown(note.id, e)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* Drag handle — only this area initiates drag */}
      <div
        data-drag-handle="true"
        className="h-5 bg-gray-50 rounded-t-lg cursor-grab active:cursor-grabbing border-b border-gray-100 flex items-center justify-center shrink-0"
      >
        <div className="w-8 h-0.5 bg-gray-300 rounded-full" />
      </div>

      {/* Title */}
      <input
        data-no-pan="true"
        className="w-full px-2 py-1 font-semibold text-sm outline-none bg-transparent border-b border-gray-100"
        value={localTitle}
        onChange={(e) => setLocalTitle(e.target.value)}
        onBlur={() => onUpdateTitle(note.id, localTitle)}
        onKeyDown={(e) => {
          // Prevent delete/backspace from bubbling to the canvas delete handler
          e.stopPropagation()
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />

      {/* Body */}
      <MarkdownEditor
        ref={editorRef}
        value={note.body}
        minHeight={Math.max(h - 80, 40)}
        onChange={(body) => onUpdateBody(note.id, body)}
      />

      {/* Nested children — absolutely positioned within this note */}
      {children}

      {/* Connection source handle — appears on hover at right edge */}
      <ConnectionHandle
        type="source"
        nodeId={note.id}
        onStartConnection={startConnection}
        className="absolute top-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm cursor-crosshair opacity-0 hover:opacity-100 transition-opacity"
        style={{ right: -6, transform: 'translateY(-50%)' }}
      />

      {/* Resize handle — bottom-right corner */}
      <div
        data-no-pan="true"
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-40 hover:opacity-80 transition-opacity rounded-br-lg"
        style={{
          background: 'linear-gradient(135deg, transparent 50%, #94a3b8 50%)',
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onResizePointerDown(note.id, { horizontal: 'right', vertical: 'bottom' }, e)
        }}
      />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
