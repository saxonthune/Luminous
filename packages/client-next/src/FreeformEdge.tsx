import { createSignal, Show } from 'solid-js';
import { useCanvasContext } from '@luminous/cactus';
import type { Edge, EdgeSide } from './api';
import { ContextMenu, type MenuItem } from './ContextMenu';

interface Point { x: number; y: number }

function rectBorderIntersection(
  rect: { x: number; y: number; w: number; h: number },
  center: Point,
  target: Point
): Point {
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
      px >= rect.x - eps && px <= rect.x + rect.w + eps &&
      py >= rect.y - eps && py <= rect.y + rect.h + eps &&
      t < bestT
    ) {
      bestT = t;
    }
  }

  if (!isFinite(bestT)) return center;
  return { x: center.x + bestT * dx, y: center.y + bestT * dy };
}

/** Get the exit/entry point for a given side of a rect. */
function sidePoint(rect: { x: number; y: number; w: number; h: number }, side: EdgeSide): Point {
  switch (side) {
    case 'top':    return { x: rect.x + rect.w / 2, y: rect.y };
    case 'bottom': return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
    case 'left':   return { x: rect.x, y: rect.y + rect.h / 2 };
    case 'right':  return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
  }
}

/**
 * Build a 3-segment orthogonal path between exit and entry points.
 * Vertical flow: exit(bottom) → vertical → horizontal jog → vertical → enter(top)
 * Horizontal flow: exit(right) → horizontal → vertical jog → horizontal → enter(left)
 */
function orthogonalPath(exit: Point, exitSide: EdgeSide, enter: Point, enterSide: EdgeSide): Point[] {
  const isVerticalFlow = (exitSide === 'top' || exitSide === 'bottom') &&
                         (enterSide === 'top' || enterSide === 'bottom');
  const isHorizontalFlow = (exitSide === 'left' || exitSide === 'right') &&
                           (enterSide === 'left' || enterSide === 'right');

  if (isVerticalFlow) {
    const midY = (exit.y + enter.y) / 2;
    return [exit, { x: exit.x, y: midY }, { x: enter.x, y: midY }, enter];
  }
  if (isHorizontalFlow) {
    const midX = (exit.x + enter.x) / 2;
    return [exit, { x: midX, y: exit.y }, { x: midX, y: enter.y }, enter];
  }
  // Mixed (e.g. exit bottom, enter left): L-shaped
  if (exitSide === 'bottom' || exitSide === 'top') {
    return [exit, { x: exit.x, y: enter.y }, enter];
  }
  return [exit, { x: enter.x, y: exit.y }, enter];
}

interface FreeformEdgeProps {
  edge: Edge;
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

  // Compute path points — reactive, recomputes when node geometry changes
  const pathPoints = (): Point[] => {
    const fr = fromRect();
    const tr = toRect();
    if (!fr || !tr) return [];

    const routing = props.edge.routing;
    if (!routing) {
      // No routing → straight line with border intersection
      const start = rectBorderIntersection(fr, fromCenter(), toCenter());
      const end = rectBorderIntersection(tr, toCenter(), fromCenter());
      return [start, end];
    }

    // Declarative routing → orthogonal path from side points
    const exit = sidePoint(fr, routing.exitSide);
    const enter = sidePoint(tr, routing.enterSide);
    return orthogonalPath(exit, routing.exitSide, enter, routing.enterSide);
  };

  const pathD = (): string => {
    const pts = pathPoints();
    if (pts.length < 2) return '';
    return 'M ' + pts.map((p) => `${p.x} ${p.y}`).join(' L ');
  };

  const midPoint = (): Point => {
    const pts = pathPoints();
    if (pts.length < 2) return { x: 0, y: 0 };
    const midIdx = Math.floor(pts.length / 2);
    const a = pts[midIdx - 1];
    const b = pts[midIdx];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const midX = () => midPoint().x;
  const midY = () => midPoint().y;

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

  const debugInfo = () => {
    const fr = fromRect();
    const tr = toRect();
    const pts = pathPoints();
    const fc = fromCenter();
    const tc = toCenter();
    return { fr, tr, pts, fc, tc };
  };

  const debugMenuItems = (): MenuItem[] => {
    const { fr, tr, pts, fc, tc } = debugInfo();
    const routing = props.edge.routing;
    return [
      { label: 'Select connected nodes', action: () => setSelectedIds([props.edge.fromId, props.edge.toId]) },
      { label: 'Copy debug to clipboard', action: () => {
        const dump = JSON.stringify({
          edge: { id: props.edge.id, fromId: props.edge.fromId, toId: props.edge.toId, label: props.edge.label, schemaName: props.edge.schemaName, routing },
          from: { rect: fr, center: fc },
          to: { rect: tr, center: tc },
          path: pts,
        }, null, 2);
        navigator.clipboard.writeText(dump);
      }},
      { label: '', action: () => {}, separator: true },
      { label: `routing: ${routing ? `${routing.exitSide} → ${routing.enterSide}` : 'straight'}`, action: () => {}, disabled: true },
      { label: `from: ${fr ? `${Math.round(fr.w)}×${Math.round(fr.h)}` : 'missing'}`, action: () => {}, disabled: true },
      { label: `to: ${tr ? `${Math.round(tr.w)}×${Math.round(tr.h)}` : 'missing'}`, action: () => {}, disabled: true },
      { label: `segments: ${pts.length - 1}`, action: () => {}, disabled: true },
    ];
  };

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
          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--edge)" />
        </marker>
      </defs>
      <g style={{ "pointer-events": 'auto' }}>
        <path
          d={pathD()}
          stroke="transparent" stroke-width={12} fill="none"
          style={{ cursor: 'pointer' }}
          onDblClick={startEditing}
        />
        <path
          d={pathD()}
          stroke="var(--edge)" stroke-width={2} stroke-linecap="round" stroke-linejoin="round" fill="none"
          marker-end={`url(#arrow-${props.edge.id})`}
          style={{ "pointer-events": 'none' }}
        />
        <Show when={editing()} fallback={
          <Show when={props.edge.label}>
            <rect
              x={midX() - labelWidth() / 2} y={midY() - 9}
              width={labelWidth()} height={18}
              rx={9} ry={9}
              fill="var(--surface)" stroke="var(--border-subtle)" stroke-width={1}
              style={{ "pointer-events": 'none' }}
            />
            <text
              x={midX()} y={midY()}
              text-anchor="middle" dominant-baseline="central"
              font-size="11" fill="var(--edge-label)"
              style={{ cursor: 'pointer', "user-select": 'none' }}
              onDblClick={startEditing}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY });
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
                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
              }}
              style={{
                width: '100%',
                "font-size": '12px',
                "text-align": 'center',
                border: '1px solid var(--edge)',
                "border-radius": '3px',
                padding: '2px 4px',
                background: 'var(--surface)',
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
