import { createSignal, createMemo, onCleanup, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useViewport, type UseViewportOptions, type Transform } from './useViewport.js';
import { observeLongTasks } from './perf.js';
import { useConnectionDrag } from './useConnectionDrag.js';
import { useBoxSelect } from './useBoxSelect.js';
import { useSelection } from './useSelection.js';
import { DotGrid } from './DotGrid.js';
import { CanvasContext, type CanvasContextValue, type NodeRect } from './CanvasContext.js';
import { EdgeLayer } from './EdgeLayer.js';
import type { EdgeDeclaration } from './types.js';
import type { ChromeSchema, MenuSchema, Action } from './chrome/types.js';
import { ChromeSlots } from './chrome/ChromeSlots.js';
import { MenuRoot } from './chrome/ChromePrimitives.js';
import { useHotkeys } from './chrome/useHotkeys.js';

export interface ConnectionPreviewCoords {
  sourceNodeId: string;
  sourceHandle: string | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Cactus is domain-agnostic. It accepts opaque node and edge declarations with
 * geometry hints. It does not know about kinds, views, roles, layers, disclosure,
 * or packs. All domain concepts are the host's responsibility.
 *
 * Node positions are tracked internally via CanvasContext (NodeContainer registers
 * on mount). Edge geometry is computed from these positions.
 */
export interface CanvasProps {
  viewportOptions?: UseViewportOptions;
  connectionDrag?: {
    onConnect: (connection: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => void;
    isValidConnection?: (connection: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) => boolean;
  };
  boxSelect?: {
    getNodeRects: () => Array<{ id: string; x: number; y: number; width: number; height: number }>;
  };
  /** Edges to draw. Cactus computes straight-line geometry from registered node rects. */
  edges?: EdgeDeclaration[];
  renderConnectionPreview?: (coords: ConnectionPreviewCoords, transform: Transform) => JSX.Element;
  class?: string;
  children: JSX.Element;
  patternId?: string;
  onBackgroundPointerDown?: (event: PointerEvent) => void;
  /**
   * Fires on right-click when the target is not inside a node (i.e. the canvas background).
   * The handler receives the raw MouseEvent. preventDefault() is called automatically.
   */
  onBackgroundContextMenu?: (event: MouseEvent) => void;
  renderBackground?: (transform: Transform, patternId?: string) => JSX.Element;
  ref?: (handle: CanvasRef) => void;
  /** Declarative toolbar schema rendered in screen-space slots (top/left/right/bottom). */
  chrome?: ChromeSchema;
  /** Dispatches action ids from chrome controls and hotkeys. */
  onAction?: (id: string, payload?: unknown) => void;
  /** Returns a MenuSchema for a node right-click, or undefined for no menu. */
  nodeContextMenu?: (nodeId: string) => MenuSchema | undefined;
  /** Returns a MenuSchema for a background right-click, or undefined for no menu. */
  backgroundContextMenu?: () => MenuSchema | undefined;
}

export interface CanvasRef {
  fitView: (rects: Array<{ x: number; y: number; width: number; height: number }>, padding?: number) => void;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  getTransform: () => Transform;
  zoomIn: () => void;
  zoomOut: () => void;
  clearSelection: () => void;
}

/** Flatten all Action records from a ChromeSchema for hotkey registration. */
function flattenActions(chrome: ChromeSchema | undefined): Action[] {
  if (!chrome) return [];
  const actions: Action[] = [];
  const slots = [chrome.top, chrome.left, chrome.right, chrome.bottom];
  for (const slot of slots) {
    if (!slot) continue;
    for (const toolbar of slot) {
      for (const ctrl of toolbar.controls) {
        if (ctrl.type === 'button') actions.push(ctrl.action);
        else if (ctrl.type === 'toggle-group' || ctrl.type === 'toggle-set') {
          actions.push(...ctrl.actions);
        }
      }
    }
  }
  return actions;
}

export function Canvas(props: CanvasProps) {
  // Canvas configuration (viewportOptions, connectionDrag, boxSelect, ref) is read once at mount;
  // parents are expected to remount Canvas if the configuration changes.
  /* eslint-disable solid/reactivity */
  const { transform, setContainerRef, containerEl, fitView, screenToCanvas, zoomIn, zoomOut } = useViewport(props.viewportOptions);

  // Node rect registry — populated by NodeContainer via context; consumed by EdgeLayer.
  const nodeRectsData = new Map<string, NodeRect>();
  const [nodeRectsVersion, setNodeRectsVersion] = createSignal(0);
  const registerNodeRect = (id: string, rect: NodeRect) => {
    nodeRectsData.set(id, rect);
    setNodeRectsVersion((v) => v + 1);
  };
  const unregisterNodeRect = (id: string) => {
    nodeRectsData.delete(id);
    setNodeRectsVersion((v) => v + 1);
  };
  const getNodeRects = (): ReadonlyMap<string, NodeRect> => {
    nodeRectsVersion(); // reactive dependency — re-evaluates when any rect changes
    return nodeRectsData;
  };

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

  // Context menu state — rendered in a Portal at cursor position.
  const [ctxMenuState, setCtxMenuState] = createSignal<{
    x: number;
    y: number;
    schema: MenuSchema;
  } | null>(null);

  // Hotkeys: flatten actions from the chrome schema and register a global keydown listener.
  const allActions = createMemo(() => flattenActions(props.chrome));
  useHotkeys(allActions, (id, payload) => props.onAction?.(id, payload));

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
    registerNodeRect,
    unregisterNodeRect,
    getNodeRects,
  };
  /* eslint-enable solid/reactivity */

  const handleContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const container = target.closest?.('[data-container-id]');

    if (container && props.nodeContextMenu) {
      const nodeId = container.getAttribute('data-container-id')!;
      const schema = props.nodeContextMenu(nodeId);
      if (schema && schema.items.length > 0) {
        e.preventDefault();
        setCtxMenuState({ x: e.clientX, y: e.clientY, schema });
        return;
      }
    }

    if (!container) {
      if (props.backgroundContextMenu) {
        const schema = props.backgroundContextMenu();
        if (schema && schema.items.length > 0) {
          e.preventDefault();
          setCtxMenuState({ x: e.clientX, y: e.clientY, schema });
          return;
        }
      }
      if (props.onBackgroundContextMenu) {
        e.preventDefault();
        props.onBackgroundContextMenu(e);
      }
    }
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
        onContextMenu={handleContextMenu}
      >
        {props.renderBackground
          ? props.renderBackground(transform(), props.patternId)
          : <DotGrid transform={transform()} patternId={props.patternId} />
        }

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

        <Show when={(props.edges?.length ?? 0) > 0}>
          <svg data-cactus-edge-layer width="100%" height="100%" style={{ position: 'absolute', inset: '0', "pointer-events": 'none' }}>
            <g transform={`translate(${transform().x}, ${transform().y}) scale(${transform().k})`}>
              <EdgeLayer edges={props.edges!} getNodeRects={getNodeRects} />
            </g>
          </svg>
        </Show>

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
                border: '1px solid var(--accent)',
                "background-color": 'var(--accent-10)',
                "pointer-events": 'none',
              }}
            />
          )}
        </Show>

        {/* Screen-space chrome toolbars — anchored to viewport, resist pan/zoom */}
        <ChromeSlots schema={props.chrome} onAction={props.onAction} />
      </div>

      {/* Context menu — rendered outside the canvas container for correct stacking */}
      <Show when={ctxMenuState()}>
        {(state) => (
          <Portal>
            <MenuRoot
              schema={state().schema}
              open
              onOpenChange={(open) => { if (!open) setCtxMenuState(null); }}
              anchorX={state().x}
              anchorY={state().y}
              onAction={props.onAction}
            />
          </Portal>
        )}
      </Show>
    </CanvasContext.Provider>
  );
}
