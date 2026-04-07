import { createSignal, Show } from 'solid-js';
import type { Note, Edge } from './api';

function getAbsoluteTopLeft(
  noteId: string,
  notes: Record<string, Note>
): { x: number; y: number } {
  const note = notes[noteId];
  if (!note) return { x: 0, y: 0 };
  if (!note.parentId) return { x: note.x, y: note.y };
  const parentAbs = getAbsoluteTopLeft(note.parentId, notes);
  return { x: parentAbs.x + note.x, y: parentAbs.y + note.y };
}

function getAbsoluteRect(
  noteId: string,
  notes: Record<string, Note>
): { x: number; y: number; w: number; h: number } {
  const note = notes[noteId];
  if (!note) return { x: 0, y: 0, w: 0, h: 0 };
  const topLeft = getAbsoluteTopLeft(noteId, notes);
  return { x: topLeft.x, y: topLeft.y, w: note.w, h: note.h };
}

function rectBorderIntersection(
  rect: { x: number; y: number; w: number; h: number },
  center: { x: number; y: number },
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const candidates: number[] = [];
  if (dx !== 0) {
    candidates.push((rect.x - center.x) / dx);
    candidates.push((rect.x + rect.w - center.x) / dx);
  }
  if (dy !== 0) {
    candidates.push((rect.y - center.y) / dy);
    candidates.push((rect.y + rect.h - center.y) / dy);
  }

  const eps = 0.001;
  let bestT = Infinity;
  for (const t of candidates) {
    if (t <= 0) continue;
    const px = center.x + t * dx;
    const py = center.y + t * dy;
    if (
      px >= rect.x - eps &&
      px <= rect.x + rect.w + eps &&
      py >= rect.y - eps &&
      py <= rect.y + rect.h + eps &&
      t < bestT
    ) {
      bestT = t;
    }
  }

  if (!isFinite(bestT)) return center;
  return { x: center.x + bestT * dx, y: center.y + bestT * dy };
}

interface FreeformEdgeProps {
  edge: Edge;
  notes: Record<string, Note>;
  onUpdateLabel?: (edgeId: string, label: string | null) => void;
}

export function FreeformEdge(props: FreeformEdgeProps) {
  const [editing, setEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal('');

  const fromRect = () => getAbsoluteRect(props.edge.fromId, props.notes);
  const toRect = () => getAbsoluteRect(props.edge.toId, props.notes);
  const fromCenter = () => {
    const r = fromRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const toCenter = () => {
    const r = toRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const from = () => rectBorderIntersection(fromRect(), fromCenter(), toCenter());
  const to = () => rectBorderIntersection(toRect(), toCenter(), fromCenter());
  const midX = () => (from().x + to().x) / 2;
  const midY = () => (from().y + to().y) / 2;

  function startEditing() {
    setEditValue(props.edge.label ?? '');
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    const trimmed = editValue().trim();
    props.onUpdateLabel?.(props.edge.id, trimmed === '' ? null : trimmed);
  }

  function cancelEdit() {
    setEditing(false);
  }

  return (
    <Show when={props.notes[props.edge.fromId] && props.notes[props.edge.toId]}>
      <g style={{ "pointer-events": 'auto' }}>
        <line
          x1={from().x} y1={from().y} x2={to().x} y2={to().y}
          stroke="transparent" stroke-width={12}
          style={{ cursor: 'pointer' }}
          onDblClick={startEditing}
        />
        <line
          x1={from().x} y1={from().y} x2={to().x} y2={to().y}
          stroke="#94a3b8" stroke-width={2} stroke-linecap="round"
          style={{ "pointer-events": 'none' }}
        />
        <Show when={editing()} fallback={
          <Show when={props.edge.label}>
            <text
              x={midX()} y={midY()}
              text-anchor="middle" dominant-baseline="middle"
              font-size="12" fill="#64748b"
              style={{ cursor: 'pointer', "user-select": 'none' }}
              onDblClick={startEditing}
            >
              {props.edge.label}
            </text>
          </Show>
        }>
          <foreignObject x={midX() - 60} y={midY() - 12} width={120} height={24}>
            <input
              autofocus
              value={editValue()}
              onInput={(e) => setEditValue(e.currentTarget.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              style={{
                width: '100%',
                "font-size": '12px',
                "text-align": 'center',
                border: '1px solid #94a3b8',
                "border-radius": '3px',
                padding: '2px 4px',
                background: 'white',
                outline: 'none',
              }}
            />
          </foreignObject>
        </Show>
      </g>
    </Show>
  );
}
