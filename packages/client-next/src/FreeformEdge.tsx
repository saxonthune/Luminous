import { useState } from 'react'
import type { Note, Edge } from './api'

/**
 * Compute the absolute canvas top-left position of a note, walking up the
 * parent chain for nested notes.
 */
function getAbsoluteTopLeft(
  noteId: string,
  notes: Record<string, Note>
): { x: number; y: number } {
  const note = notes[noteId]
  if (!note) return { x: 0, y: 0 }
  if (!note.parentId) return { x: note.x, y: note.y }
  const parentAbs = getAbsoluteTopLeft(note.parentId, notes)
  return { x: parentAbs.x + note.x, y: parentAbs.y + note.y }
}

function getAbsoluteRect(
  noteId: string,
  notes: Record<string, Note>
): { x: number; y: number; w: number; h: number } {
  const note = notes[noteId]
  if (!note) return { x: 0, y: 0, w: 0, h: 0 }
  const topLeft = getAbsoluteTopLeft(noteId, notes)
  return { x: topLeft.x, y: topLeft.y, w: note.w, h: note.h }
}

/**
 * Returns the point where the line from `center` toward `target` exits the
 * rectangle defined by `rect` ({x, y, w, h} in absolute canvas coords).
 * Falls back to center if the direction is zero (same-position nodes).
 */
function rectBorderIntersection(
  rect: { x: number; y: number; w: number; h: number },
  center: { x: number; y: number },
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (dx === 0 && dy === 0) return center

  // Parametric: point = center + t * (dx, dy)
  // Find smallest positive t where the ray exits the rectangle
  const candidates: number[] = []
  if (dx !== 0) {
    candidates.push((rect.x - center.x) / dx)              // left edge
    candidates.push((rect.x + rect.w - center.x) / dx)     // right edge
  }
  if (dy !== 0) {
    candidates.push((rect.y - center.y) / dy)              // top edge
    candidates.push((rect.y + rect.h - center.y) / dy)     // bottom edge
  }

  const eps = 0.001
  let bestT = Infinity
  for (const t of candidates) {
    if (t <= 0) continue
    const px = center.x + t * dx
    const py = center.y + t * dy
    if (
      px >= rect.x - eps &&
      px <= rect.x + rect.w + eps &&
      py >= rect.y - eps &&
      py <= rect.y + rect.h + eps &&
      t < bestT
    ) {
      bestT = t
    }
  }

  if (!isFinite(bestT)) return center
  return { x: center.x + bestT * dx, y: center.y + bestT * dy }
}

interface FreeformEdgeProps {
  edge: Edge
  notes: Record<string, Note>
  onUpdateLabel?: (edgeId: string, label: string | null) => void
}

/**
 * Renders a single freeform edge as an SVG line between node borders.
 * Supports double-click to edit the label inline.
 * Called from Canvas's renderEdges prop — returns raw SVG elements.
 */
export function FreeformEdge({ edge, notes, onUpdateLabel }: FreeformEdgeProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  // Don't render if either note is missing
  if (!notes[edge.fromId] || !notes[edge.toId]) return null

  const fromRect = getAbsoluteRect(edge.fromId, notes)
  const toRect = getAbsoluteRect(edge.toId, notes)
  const fromCenter = { x: fromRect.x + fromRect.w / 2, y: fromRect.y + fromRect.h / 2 }
  const toCenter = { x: toRect.x + toRect.w / 2, y: toRect.y + toRect.h / 2 }

  const from = rectBorderIntersection(fromRect, fromCenter, toCenter)
  const to = rectBorderIntersection(toRect, toCenter, fromCenter)

  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2

  function startEditing() {
    setEditValue(edge.label ?? '')
    setEditing(true)
  }

  function commitEdit() {
    setEditing(false)
    const trimmed = editValue.trim()
    onUpdateLabel?.(edge.id, trimmed === '' ? null : trimmed)
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <g style={{ pointerEvents: 'auto' }}>
      {/* Invisible thick hit area for easier clicking */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
        onDoubleClick={startEditing}
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#94a3b8"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      {editing ? (
        <foreignObject x={midX - 60} y={midY - 12} width={120} height={24}>
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitEdit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancelEdit()
              }
            }}
            style={{
              width: '100%',
              fontSize: 12,
              textAlign: 'center',
              border: '1px solid #94a3b8',
              borderRadius: 3,
              padding: '2px 4px',
              background: 'white',
              outline: 'none',
            }}
          />
        </foreignObject>
      ) : (
        edge.label && (
          <text
            x={midX}
            y={midY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fill="#64748b"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onDoubleClick={startEditing}
          >
            {edge.label}
          </text>
        )
      )}
    </g>
  )
}
