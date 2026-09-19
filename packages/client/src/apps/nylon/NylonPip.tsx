import { NYLON_VIEW_POLICY } from './viewportPolicy.ts';
import { createEffect, onCleanup, Show, untrack } from 'solid-js';
import { useCanvasContext, useGesture } from '@luminous/cactus';
import type { CandidatePlacementRect } from '@luminous/cactus/layout';
import { pipFrameId, type NylonPip as Pip } from './pipSession.ts';

/** A peer frame, not a nested canvas. Contents use NylonViewContent alongside it. */
export function NylonPip(props: {
  pip: Pip;
  frame: CandidatePlacementRect;
  name: string;
  missing: boolean;
  sourceMissing: boolean;
  onMove: (id: string, x: number, y: number) => void;
  onClose: () => void;
  onToggleContext: () => void;
  onOpenTab?: () => void;
  onArrange: () => void;
  blocked: boolean;
}) {
  const ctx = useCanvasContext();
  const frameId = untrack(() => pipFrameId(props.pip.id));
  let start = { x: 0, y: 0 };
  const gesture = useGesture({ zoomScale: () => ctx.transform().k, callbacks: {
    onDragStart: () => { start = { x: props.pip.x, y: props.pip.y }; },
    onDrag: (_, dx, dy) => props.onMove(props.pip.id, start.x + dx, start.y + dy),
    onDragEnd: (_, dx, dy) => props.onMove(props.pip.id, start.x + dx, start.y + dy),
  } });
  createEffect(() => ctx.registerNodeRect(pipFrameId(props.pip.id), {
    x: props.frame.x, y: props.frame.y, w: props.frame.width, h: props.frame.height,
  }));
  onCleanup(() => ctx.unregisterNodeRect(frameId));
  return <div data-nylon-pip={props.pip.id} style={{ position: 'absolute', left: `${props.frame.x}px`, top: `${props.frame.y}px`,
    width: `${props.frame.width}px`, height: `${props.frame.height}px`, 'box-sizing': 'border-box',
    border: '2px solid var(--fg-muted)', 'border-radius': '10px', background: 'var(--surface-alt)',
    'pointer-events': 'none', 'z-index': 0 }}>
    <div data-no-pan data-pip-handle style={{ height: '38px', display: 'flex', 'align-items': 'center', gap: '10px',
      padding: '0 10px', color: 'var(--fg)', 'pointer-events': 'auto', cursor: 'grab' }}
      onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button')) return;
        event.stopPropagation(); gesture.beginPress(pipFrameId(props.pip.id), event); }}>
      <strong title={props.name} style={{ flex: 1, "min-width": 0, "font-size": `${Math.min(40, Math.max(22, 12 / ctx.transform().k))}px`, "line-height": 1, "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>PIP · {props.name}</strong>
      <Show when={props.sourceMissing}><span>Source unavailable</span></Show>
      <Show when={ctx.transform().k >= NYLON_VIEW_POLICY.namesOnlyZoom}>
      <button type="button" aria-pressed={!!props.pip.showContext} onClick={() => props.onToggleContext()}>Show context</button>
      <button type="button" onClick={() => props.onOpenTab?.()}>Open in tab</button>
      <button type="button" disabled={props.blocked || props.missing} onClick={() => props.onArrange()}>Arrange children</button>
      </Show>
      <button type="button" aria-label={`Close PIP ${props.name}`} onClick={() => props.onClose()}>×</button>
    </div>
    <Show when={props.missing}><p class="p-4 text-fg">This Transformation no longer exists. This PIP is retained.</p></Show>
  </div>;
}
