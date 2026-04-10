import { createSignal, Show } from 'solid-js';
import { useCanvasContext } from '@luminous/cactus';
import type { Edge } from './api';
import { ContextMenu, type MenuItem } from './ContextMenu';

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
  /** Returns the absolute canvas rect for a node id, or undefined if not found. */
  getAbsoluteRect: (id: string) => { x: number; y: number; w: number; h: number } | undefined;
  onUpdateLabel?: (edgeId: string, label: string | null) => void;
}

export function FreeformEdge(props: FreeformEdgeProps) {
  const { setSelectedIds } = useCanvasContext();
  const [editing, setEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal('');
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);

  const fromRect = () => props.getAbsoluteRect(props.edge.fromId);
  const toRect = () => props.getAbsoluteRect(props.edge.toId);
  const fromCenter = () => {
    const r = fromRect();
    if (!r) return { x: 0, y: 0 };
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const toCenter = () => {
    const r = toRect();
    if (!r) return { x: 0, y: 0 };
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const from = () => {
    const r = fromRect();
    if (!r) return { x: 0, y: 0 };
    return rectBorderIntersection(r, fromCenter(), toCenter());
  };
  const to = () => {
    const r = toRect();
    if (!r) return { x: 0, y: 0 };
    return rectBorderIntersection(r, toCenter(), fromCenter());
  };
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

  function handleContextMenu(screenX: number, screenY: number) {
    setContextMenu({ x: screenX, y: screenY });
  }

  const debugInfo = () => {
    const fr = fromRect();
    const tr = toRect();
    const f = from();
    const t = to();
    const fc = fromCenter();
    const tc = toCenter();
    return { fr, tr, f, t, fc, tc };
  };

  const debugMenuItems = (): MenuItem[] => {
    const { fr, tr, f, t, fc, tc } = debugInfo();
    return [
      { label: 'Select connected nodes', action: () => setSelectedIds([props.edge.fromId, props.edge.toId]) },
      { label: 'Copy debug to clipboard', action: () => {
        const dump = JSON.stringify({
          edge: { id: props.edge.id, fromId: props.edge.fromId, toId: props.edge.toId, label: props.edge.label, schemaName: props.edge.schemaName },
          from: { rect: fr, center: fc, endpoint: f },
          to: { rect: tr, center: tc, endpoint: t },
        }, null, 2);
        navigator.clipboard.writeText(dump);
      }},
      { label: '', action: () => {}, separator: true },
      { label: `from rect: (${fr ? `${Math.round(fr.x)},${Math.round(fr.y)} ${Math.round(fr.w)}×${Math.round(fr.h)}` : 'missing'})`, action: () => {}, disabled: true },
      { label: `from center: (${Math.round(fc.x)},${Math.round(fc.y)})`, action: () => {}, disabled: true },
      { label: `from endpoint: (${Math.round(f.x)},${Math.round(f.y)})`, action: () => {}, disabled: true },
      { label: '', action: () => {}, separator: true },
      { label: `to rect: (${tr ? `${Math.round(tr.x)},${Math.round(tr.y)} ${Math.round(tr.w)}×${Math.round(tr.h)}` : 'missing'})`, action: () => {}, disabled: true },
      { label: `to center: (${Math.round(tc.x)},${Math.round(tc.y)})`, action: () => {}, disabled: true },
      { label: `to endpoint: (${Math.round(t.x)},${Math.round(t.y)})`, action: () => {}, disabled: true },
    ];
  };

  // Estimate label width for the stadium background
  const labelWidth = () => (props.edge.label?.length ?? 0) * 6.5 + 16;

  return (
    <Show when={fromRect() && toRect()}>
      <defs>
        <marker
          id={`arrow-${props.edge.id}`}
          viewBox="0 0 10 10"
          refX="10" refY="5"
          markerWidth="8" markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-edge)" />
        </marker>
      </defs>
      <g style={{ "pointer-events": 'auto' }}>
        <line
          x1={from().x} y1={from().y} x2={to().x} y2={to().y}
          stroke="transparent" stroke-width={12}
          style={{ cursor: 'pointer' }}
          onDblClick={startEditing}
        />
        <line
          x1={from().x} y1={from().y} x2={to().x} y2={to().y}
          stroke="var(--color-edge)" stroke-width={2} stroke-linecap="round"
          marker-end={`url(#arrow-${props.edge.id})`}
          style={{ "pointer-events": 'none' }}
        />
        <Show when={editing()} fallback={
          <Show when={props.edge.label}>
            {/* Stadium pill background behind edge label */}
            <rect
              x={midX() - labelWidth() / 2} y={midY() - 9}
              width={labelWidth()} height={18}
              rx={9} ry={9}
              fill="var(--bg-surface)" stroke="var(--border-subtle)" stroke-width={1}
              style={{ "pointer-events": 'none' }}
            />
            <text
              x={midX()} y={midY()}
              text-anchor="middle" dominant-baseline="central"
              font-size="11" fill="var(--color-edge-label)"
              style={{ cursor: 'pointer', "user-select": 'none' }}
              onDblClick={startEditing}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleContextMenu(e.clientX, e.clientY);
              }}
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
                border: '1px solid var(--color-edge)',
                "border-radius": '3px',
                padding: '2px 4px',
                background: 'var(--bg-surface)',
                outline: 'none',
              }}
            />
          </foreignObject>
        </Show>
      </g>
      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            x={menu().x}
            y={menu().y}
            header={`${props.edge.schemaName ?? 'edge'} · ${props.edge.id.slice(0, 8)}`}
            items={debugMenuItems()}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>
    </Show>
  );
}
