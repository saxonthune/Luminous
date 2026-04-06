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

function getAbsoluteCenter(
  noteId: string,
  notes: Record<string, Note>
): { x: number; y: number } {
  const note = notes[noteId]
  if (!note) return { x: 0, y: 0 }
  const topLeft = getAbsoluteTopLeft(noteId, notes)
  return { x: topLeft.x + note.w / 2, y: topLeft.y + note.h / 2 }
}

interface FreeformEdgeProps {
  edge: Edge
  notes: Record<string, Note>
}

/**
 * Renders a single freeform edge as an SVG line between note centers.
 * Called from Canvas's renderEdges prop — returns raw SVG elements.
 */
export function FreeformEdge({ edge, notes }: FreeformEdgeProps) {
  const from = getAbsoluteCenter(edge.fromId, notes)
  const to = getAbsoluteCenter(edge.toId, notes)

  // Don't render if either note is missing
  if (!notes[edge.fromId] || !notes[edge.toId]) return null

  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2

  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#94a3b8"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {edge.label && (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="#64748b"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {edge.label}
        </text>
      )}
    </g>
  )
}
