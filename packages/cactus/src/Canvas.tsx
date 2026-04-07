import { createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { useViewport, type UseViewportOptions, type Transform } from './useViewport.js';
import { observeLongTasks } from './perf.js';
import { useConnectionDrag } from './useConnectionDrag.js';
import { useBoxSelect } from './useBoxSelect.js';
import { useSelection } from './useSelection.js';
import { DotGrid } from './DotGrid.js';
import { CanvasContext, type CanvasContextValue } from './CanvasContext.js';

export interface ConnectionPreviewCoords {
  sourceNodeId: string;
  sourceHandle: string | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface CanvasProps {
  viewportOptions?: UseViewportOptions;
  connectionDrag?: {
    onConnect: (connection: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => void;
    isValidConnection?: (connection: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => boolean;
  };
  boxSelect?: {
    getNodeRects: () => Array<{ id: string; x: number; y: number; width: number; height: number }>;
  };
  renderEdges?: (transform: Transform) => JSX.Element;
  renderConnectionPreview?: (coords: ConnectionPreviewCoords, transform: Transform) => JSX.Element;
  class?: string;
  children: JSX.Element;
  patternId?: string;
  onBackgroundPointerDown?: (event: PointerEvent) => void;
  renderBackground?: (transform: Transform, patternId?: string) => JSX.Element;
  ref?: (handle: CanvasRef) => void;
}

export interface CanvasRef {
  fitView: (rects: Array<{ x: number; y: number; width: number; height: number }>, padding?: number) => void;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  getTransform: () => Transform;
  zoomIn: () => void;
  zoomOut: () => void;
  clearSelection: () => void;
}

export function Canvas(props: CanvasProps) {
  const { transform, setContainerRef, containerEl, fitView, screenToCanvas, zoomIn, zoomOut } = useViewport(props.viewportOptions);

  const connectionDragResult = useConnectionDrag(
    props.connectionDrag
      ? { ...props.connectionDrag, screenToCanvas }
      : { onConnect: () => {}, screenToCanvas }
  );
  const { connectionDrag: connectionDragState, startConnection } = connectionDragResult;

  const selection = useSelection({});
  const { selectedIds, clearSelection, isSelected, onNodePointerDown, setSelectedIds } = selection;

  const boxSelectResult = useBoxSelect(
    props.boxSelect
      ? {
          transform,
          containerEl,
          getNodeRects: props.boxSelect.getNodeRects,
          onBoxSelectHits: selection.mergeBoxSelection,
        }
      : {
          transform,
          containerEl,
          getNodeRects: () => [],
        }
  );
  const { selectionRect } = boxSelectResult;

  if (import.meta.env.DEV) {
    const cleanup = observeLongTasks();
    onCleanup(cleanup);
  }

  const [ctrlHeld, setCtrlHeld] = createSignal(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) setCtrlHeld(true);
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false);
  };
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  props.ref?.({
    fitView,
    screenToCanvas,
    getTransform: () => transform(),
    zoomIn,
    zoomOut,
    clearSelection,
  });

  const contextValue: CanvasContextValue = {
    transform,
    screenToCanvas,
    startConnection: props.connectionDrag ? startConnection : () => {},
    connectionDrag: props.connectionDrag ? connectionDragState : () => null,
    selectedIds,
    clearSelection,
    isSelected,
    onNodePointerDown,
    setSelectedIds,
    ctrlHeld,
  };

  return (
    <CanvasContext.Provider value={contextValue}>
      <div
        ref={setContainerRef}
        class={props.class}
        style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', "user-select": 'none' }}
        onPointerDown={(e) => {
          if (props.onBackgroundPointerDown) {
            const target = e.target as HTMLElement;
            if (!target.closest?.('[data-no-pan]')) {
              props.onBackgroundPointerDown(e);
            }
          }
        }}
      >
        {props.renderBackground
          ? props.renderBackground(transform(), props.patternId)
          : <DotGrid transform={transform()} patternId={props.patternId} />
        }

        <Show when={props.renderEdges}>
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: '0', "pointer-events": 'none' }}>
            <g transform={`translate(${transform().x}, ${transform().y}) scale(${transform().k})`}>
              {props.renderEdges!(transform())}
            </g>
          </svg>
        </Show>

        <div
          style={{
            transform: `translate(${transform().x}px, ${transform().y}px) scale(${transform().k})`,
            "transform-origin": '0 0',
            position: 'absolute',
            inset: '0',
          }}
        >
          {props.children}
        </div>

        <Show when={connectionDragState() && props.renderConnectionPreview}>
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: '0', "pointer-events": 'none' }}>
            {(() => {
              const state = connectionDragState()!;
              const el = containerEl();
              const rect = el?.getBoundingClientRect();
              const offsetX = rect?.left ?? 0;
              const offsetY = rect?.top ?? 0;
              const t = transform();
              const coords: ConnectionPreviewCoords = {
                sourceNodeId: state.sourceNodeId,
                sourceHandle: state.sourceHandle,
                startX: state.startCanvasX * t.k + t.x,
                startY: state.startCanvasY * t.k + t.y,
                currentX: state.currentScreenX - offsetX,
                currentY: state.currentScreenY - offsetY,
              };
              return props.renderConnectionPreview!(coords, t);
            })()}
          </svg>
        </Show>

        <Show when={selectionRect()}>
          {(rect) => (
            <div
              style={{
                position: 'absolute',
                left: `${rect().x}px`,
                top: `${rect().y}px`,
                width: `${rect().width}px`,
                height: `${rect().height}px`,
                border: '1px solid var(--color-accent)',
                "background-color": 'var(--color-accent-10)',
                "pointer-events": 'none',
              }}
            />
          )}
        </Show>
      </div>
    </CanvasContext.Provider>
  );
}
