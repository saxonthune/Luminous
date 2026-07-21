import { createSignal, createMemo, onCleanup, Show, For, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { useViewport, type UseViewportOptions, type Transform } from './interactions/useViewport.js';
import { observeLongTasks } from './perf.js';
import { useGesture } from './interactions/useGesture.js';
import { useSelection } from './interactions/useSelection.js';
import { DotGrid } from './DotGrid.js';
import { CanvasContext, type CanvasContextValue, type NodeRect } from './CanvasContext.js';
import type { ConnectionDragState } from './interactions/useConnectionDrag.js';
import { EdgeLayer } from './EdgeLayer.js';
import type { EdgeDeclaration, ClusterDeclaration } from './types.js';
import { computeBounds } from './geometry/geometry.js';
import type { ChromeSchema, MenuSchema, Action } from './chrome/types.js';
import { ChromeSlots } from './chrome/ChromeSlots.js';
import { MenuRoot } from './chrome/ChromePrimitives.js';
import { useHotkeys } from './chrome/useHotkeys.js';
import { createLayoutOverrides } from './interactions/createLayoutOverrides.js';

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
    /** Ctrl/Meta + release (or click) while connecting — see `useGesture`'s
        `connection.onConnectDrop` (R52). */
    onConnectDrop?: (info: {
      source: string;
      sourceHandle: string | null;
      clientX: number;
      clientY: number;
      ctrlKey: boolean;
    }) => void;
  };
  boxSelect?: {
    getNodeRects: () => Array<{ id: string; x: number; y: number; width: number; height: number }>;
    /** 'shift-drag' (default) or 'drag' — plain left-drag marquees and left-drag
        panning is disabled (middle-drag still pans). */
    trigger?: 'shift-drag' | 'drag';
  };
  /** Edges to draw. Cactus computes straight-line geometry from registered node rects. */
  edges?: EdgeDeclaration[];
  /** Clusters to draw as a tinted underlay behind their member nodes. */
  clusters?: ClusterDeclaration[];
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
  /** Returns a MenuSchema for an edge right-click, or undefined for no menu. */
  edgeContextMenu?: (edgeId: string) => MenuSchema | undefined;
  /** Fires whenever the selection changes (click, marquee, clear). */
  onSelectionChange?: (ids: ReadonlyArray<string>) => void;
}

export interface CanvasRef {
  fitView: (rects: Array<{ x: number; y: number; width: number; height: number }>, padding?: number) => void;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  getTransform: () => Transform;
  zoomIn: () => void;
  zoomOut: () => void;
  clearSelection: () => void;
  getSelectedIds: () => ReadonlyArray<string>;
}

/** Pointer must travel this far (screen px) before a label drag starts, so a
    double-click to edit doesn't jiggle the cluster. */
const LABEL_DRAG_THRESHOLD = 3;

// Tag hanging outside the cluster rect, under its bottom-right corner — member
// boxes can't cover it there. border-top: none + squared top corners make it
// read as attached to the cluster border.
const LABEL_TAG_STYLE: JSX.CSSProperties = {
  position: 'absolute',
  right: '8px',
  top: '100%',
  padding: '1px 8px',
  'font-size': '11px',
  background: 'var(--cactus-surface, #ffffff)',
  border: '1px solid var(--cactus-border-subtle, #f3f4f6)',
  'border-top': 'none',
  'border-radius': '0 0 6px 6px',
  'white-space': 'nowrap',
};

/**
 * Cluster label — passive text by default; double-click-editable when
 * `onLabelEdit` is provided, draggable (moving the whole cluster) when
 * `onDrag` is provided. Editing state is local to this component so a
 * per-cluster signal isn't threaded through the parent.
 */
function ClusterLabel(props: {
  label: string;
  zoomScale: () => number;
  onLabelEdit?: (newLabel: string) => void;
  onDragStart?: () => void;
  onDrag?: (deltaX: number, deltaY: number) => void;
  onDragEnd?: () => void;
}) {
  const [editing, setEditing] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  const startEdit = () => {
    if (!props.onLabelEdit) return;
    setEditing(true);
    queueMicrotask(() => {
      inputRef?.focus();
      inputRef?.select();
    });
  };

  const commit = () => {
    const value = inputRef?.value ?? '';
    setEditing(false);
    if (value !== '' && value !== props.label) {
      props.onLabelEdit?.(value);
    }
  };

  const cancel = () => setEditing(false);

  const handleDragPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !props.onDrag) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!started) {
        if (Math.hypot(dx, dy) < LABEL_DRAG_THRESHOLD) return;
        started = true;
        props.onDragStart?.();
      }
      const k = props.zoomScale();
      props.onDrag?.(dx / k, dy / k);
    };

    const handleUp = () => {
      if (started) props.onDragEnd?.();
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const interactive = () => Boolean(props.onLabelEdit || props.onDrag);

  return (
    <Show
      when={editing()}
      fallback={
        <div
          style={{
            ...LABEL_TAG_STYLE,
            color: 'var(--cactus-fg-muted, #6b7280)',
            'pointer-events': interactive() ? 'auto' : 'none',
            cursor: props.onDrag ? 'grab' : props.onLabelEdit ? 'text' : undefined,
          }}
          data-no-pan={interactive() ? 'true' : undefined}
          onPointerDown={handleDragPointerDown}
          onDblClick={props.onLabelEdit ? (e) => { e.stopPropagation(); startEdit(); } : undefined}
        >
          {props.label}
        </div>
      }
    >
      <input
        ref={inputRef}
        value={props.label}
        style={{
          ...LABEL_TAG_STYLE,
          'pointer-events': 'auto',
        }}
        data-no-pan="true"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') cancel();
        }}
        onBlur={commit}
      />
    </Show>
  );
}

/**
 * Underlay rendering for cluster rects — a passive, pointer-events-none tint
 * derived from the live node-rect registry. A cluster with no registered
 * members (empty set, or no rects yet) renders nothing.
 */
export function ClusterUnderlay(props: {
  clusters: ClusterDeclaration[];
  getNodeRects: () => ReadonlyMap<string, NodeRect>;
  zoomScale: () => number;
  /** Like EdgeLayer's lines/labels split: 'rects' paints the tint below the
      node layer; 'labels' repeats the bounds math in an overlay above it, so
      labels stay visible and reachable by the pointer (the node layer's
      full-canvas wrapper hit-tests over anything beneath it). */
  layer: 'rects' | 'labels';
}) {
  return (
    <For each={props.clusters}>
      {(cluster) => {
        const bounds = createMemo(() => {
          const rects = props.getNodeRects();
          const memberRects = cluster.memberIds
            .map((id) => rects.get(id))
            .filter((r): r is NodeRect => r != null)
            .map((r) => ({ x: r.x, y: r.y, width: r.w, height: r.h }));
          if (memberRects.length === 0) return null;
          return computeBounds(memberRects, { padding: 16, minWidth: 0, minHeight: 0 });
        });
        return (
          <Show when={bounds()}>
            {(b) => (
              <div
                data-cluster-id={props.layer === 'rects' ? cluster.id : undefined}
                style={{
                  position: 'absolute',
                  left: `${b().x}px`,
                  top: `${b().y}px`,
                  width: `${b().width}px`,
                  height: `${b().height}px`,
                  ...(props.layer === 'rects'
                    ? {
                        background: cluster.tint ?? 'var(--cactus-container-tint, rgba(0,0,0,0.04))',
                        border: '1px solid var(--cactus-border-subtle, #f3f4f6)',
                        'border-radius': '8px',
                      }
                    : {}),
                  'pointer-events': 'none',
                }}
              >
                <Show when={props.layer === 'labels' && cluster.label}>
                  <ClusterLabel
                    label={cluster.label!}
                    zoomScale={props.zoomScale}
                    onLabelEdit={cluster.onLabelEdit}
                    onDragStart={cluster.onDragStart}
                    onDrag={cluster.onDrag}
                    onDragEnd={cluster.onDragEnd}
                  />
                </Show>
              </div>
            )}
          </Show>
        );
      }}
    </For>
  );
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
  const { transform, setContainerRef, containerEl, fitView, screenToCanvas, zoomIn, zoomOut } = useViewport(
    props.boxSelect?.trigger === 'drag'
      ? { ...props.viewportOptions, leftDragPan: false }
      : props.viewportOptions
  );

  // Right-button click vs. drag disambiguation. The right button both pans (drag)
  // and opens the context menu (click). We cannot decide from the `contextmenu`
  // event, whose timing is not portable — Chromium/Linux and macOS fire it on
  // press (before any drag is visible); Firefox fires it on release. So we drive
  // the menu from pointer events instead: track how far the pointer moved between
  // right-button pointerdown and pointerup, and open the menu on pointerup only
  // when movement stayed within the slop threshold. `contextmenu` is always
  // suppressed so the native menu never shows.
  const RIGHT_DRAG_SLOP_PX = 4;
  let rightGesture: { x: number; y: number; moved: boolean } | null = null;
  // A pointer-driven right gesture already decided the menu on pointerup; ignore
  // the trailing native `contextmenu` (Firefox fires it after release).
  let swallowContextMenu = false;

  const onRightPointerMove = (e: PointerEvent) => {
    if (rightGesture && Math.hypot(e.clientX - rightGesture.x, e.clientY - rightGesture.y) > RIGHT_DRAG_SLOP_PX) {
      rightGesture.moved = true;
    }
  };
  const onRightPointerUp = (e: PointerEvent) => {
    if (e.button !== 2) return;
    window.removeEventListener('pointermove', onRightPointerMove);
    window.removeEventListener('pointerup', onRightPointerUp);
    const gesture = rightGesture;
    rightGesture = null;
    swallowContextMenu = true;
    if (gesture && !gesture.moved) {
      openContextMenuAt(e.target as HTMLElement, e.clientX, e.clientY, e);
    }
  };
  onCleanup(() => {
    window.removeEventListener('pointermove', onRightPointerMove);
    window.removeEventListener('pointerup', onRightPointerUp);
  });

  // Node rect registry — populated by NodeContainer via context; consumed by EdgeLayer.
  const nodeRectsData = new Map<string, NodeRect>();
  const [nodeRectsVersion, setNodeRectsVersion] = createSignal(0);
  const registerNodeRect = (id: string, rect: NodeRect) => {
    // Idempotent: skip the reactive bump when the rect is unchanged, so a
    // re-registration with identical geometry is a true no-op for layout.
    const prev = nodeRectsData.get(id);
    if (prev && prev.x === rect.x && prev.y === rect.y && prev.w === rect.w && prev.h === rect.h) {
      return;
    }
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

  // Visible viewport in canvas coords — used by EdgeLayer to cull offscreen edges.
  const edgeViewport = (): { x: number; y: number; w: number; h: number } | null => {
    const el = containerEl();
    const t = transform();
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return null;
    return { x: -t.x / t.k, y: -t.y / t.k, w: el.clientWidth / t.k, h: el.clientHeight / t.k };
  };

  // Header-height registry — populated by <NodeHeader> via context; consumed by layout.
  const headerHeightsData = new Map<string, number>();
  const [headerHeightsVersion, setHeaderHeightsVersion] = createSignal(0);
  const registerHeaderHeight = (nodeId: string, height: number) => {
    if (headerHeightsData.get(nodeId) === height) return;
    headerHeightsData.set(nodeId, height);
    setHeaderHeightsVersion((v) => v + 1);
  };
  const unregisterHeaderHeight = (nodeId: string) => {
    headerHeightsData.delete(nodeId);
    setHeaderHeightsVersion((v) => v + 1);
  };
  const getHeaderHeights = (): ReadonlyMap<string, number> => {
    headerHeightsVersion(); // reactive dependency
    return headerHeightsData;
  };

  const selection = useSelection({ onSelectionChange: (ids) => props.onSelectionChange?.(ids) });
  const { selectedIds, clearSelection, isSelected, onNodePointerDown, setSelectedIds } = selection;

  const { layoutOverride, setLayoutOverride, layoutApply } = createLayoutOverrides();

  const gestureResult = useGesture({
    zoomScale: () => transform().k,
    callbacks: {},
    boxSelect: {
      transform,
      containerEl,
      getNodeRects: props.boxSelect?.getNodeRects ?? (() => []),
      trigger: props.boxSelect?.trigger,
      onBoxSelectHits: props.boxSelect ? selection.mergeBoxSelection : undefined,
    },
    connection: props.connectionDrag
      ? { ...props.connectionDrag, screenToCanvas }
      : undefined,
  });
  const { gesture, beginConnect } = gestureResult;
  const marqueeRect = () => {
    const g = gesture();
    return g.kind === 'marquee' ? g.rect : null;
  };
  const connectionDragState = (): ConnectionDragState | null => {
    const g = gesture();
    if (g.kind !== 'connecting') return null;
    return {
      sourceNodeId: g.sourceId,
      sourceHandle: g.sourceHandle,
      startCanvasX: g.startCanvasX,
      startCanvasY: g.startCanvasY,
      currentScreenX: g.currentScreenX,
      currentScreenY: g.currentScreenY,
    };
  };

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
    getSelectedIds: () => selectedIds(),
  });

  const contextValue: CanvasContextValue = {
    transform,
    screenToCanvas,
    startConnection: props.connectionDrag ? beginConnect : () => {},
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
    registerHeaderHeight,
    unregisterHeaderHeight,
    getHeaderHeights,
    fitView,
    layoutOverride,
    setLayoutOverride,
    layoutApply,
  };
  /* eslint-enable solid/reactivity */

  // Resolve which menu the target under the pointer owns and open it. Position is
  // the release point. `rawEvent` is handed to the onBackgroundContextMenu escape
  // hatch, which wants the underlying MouseEvent.
  const openContextMenuAt = (target: HTMLElement, clientX: number, clientY: number, rawEvent: MouseEvent) => {
    const container = target.closest?.('[data-container-id]');

    if (container && props.nodeContextMenu) {
      const nodeId = container.getAttribute('data-container-id')!;
      const schema = props.nodeContextMenu(nodeId);
      if (schema && schema.items.length > 0) {
        setCtxMenuState({ x: clientX, y: clientY, schema });
        return;
      }
    }

    if (!container) {
      const edgeEl = target.closest?.('[data-edge-id]');
      if (edgeEl && props.edgeContextMenu) {
        const edgeId = edgeEl.getAttribute('data-edge-id')!;
        const schema = props.edgeContextMenu(edgeId);
        if (schema && schema.items.length > 0) {
          setCtxMenuState({ x: clientX, y: clientY, schema });
          return;
        }
      }
      if (props.backgroundContextMenu) {
        const schema = props.backgroundContextMenu();
        if (schema && schema.items.length > 0) {
          setCtxMenuState({ x: clientX, y: clientY, schema });
          return;
        }
      }
      props.onBackgroundContextMenu?.(rawEvent);
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault(); // never show the native menu; the canvas drives its own
    if (swallowContextMenu) {
      swallowContextMenu = false; // trailing native menu from a gesture already resolved on pointerup
      return;
    }
    if (rightGesture) return; // a right-button gesture is in flight; pointerup will decide (Chromium/Linux fires contextmenu on press)
    openContextMenuAt(e.target as HTMLElement, e.clientX, e.clientY, e); // keyboard menu key, or any non-pointer contextmenu
  };

  return (
    <CanvasContext.Provider value={contextValue}>
      <div
        ref={setContainerRef}
        class={props.class}
        style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', "user-select": 'none', background: 'var(--cactus-canvas-bg, #ffffff)' }}
        onPointerDown={(e) => {
          swallowContextMenu = false; // any fresh pointer interaction clears a stale swallow from a prior gesture
          if (e.button === 2) {
            rightGesture = { x: e.clientX, y: e.clientY, moved: false };
            window.addEventListener('pointermove', onRightPointerMove);
            window.addEventListener('pointerup', onRightPointerUp);
          }
          if (props.onBackgroundPointerDown) {
            const target = e.target as HTMLElement;
            if (!target.closest?.('[data-no-pan]')) {
              props.onBackgroundPointerDown(e);
            }
          }
        }}
        onContextMenu={handleContextMenu}
      >
        <div
          data-cactus-pan-surface
          data-pan-surface
          style={{ position: 'absolute', inset: '0' }}
        />

        {props.renderBackground
          ? props.renderBackground(transform(), props.patternId)
          : <DotGrid transform={transform()} patternId={props.patternId} />
        }

        <Show when={(props.clusters?.length ?? 0) > 0}>
          <div
            data-cactus-cluster-underlay
            style={{
              transform: `translate(${transform().x}px, ${transform().y}px) scale(${transform().k})`,
              "transform-origin": '0 0',
              position: 'absolute',
              inset: '0',
              "pointer-events": 'none',
            }}
          >
            <ClusterUnderlay clusters={props.clusters!} getNodeRects={getNodeRects} zoomScale={() => transform().k} layer="rects" />
          </div>
        </Show>

        <Show when={(props.edges?.length ?? 0) > 0}>
          <svg data-cactus-edge-layer-lines width="100%" height="100%" style={{ position: 'absolute', inset: '0', "pointer-events": 'none' }}>
            <g transform={`translate(${transform().x}, ${transform().y}) scale(${transform().k})`}>
              <EdgeLayer edges={props.edges!} getNodeRects={getNodeRects} layer="lines" zoom={() => transform().k} viewport={edgeViewport} />
            </g>
          </svg>
        </Show>

        <div
          style={{
            transform: `translate(${transform().x}px, ${transform().y}px) scale(${transform().k})`,
            "transform-origin": '0 0',
            position: 'absolute',
            inset: '0',
            "pointer-events": 'none',
          }}
        >
          {props.children}
        </div>

        <Show when={(props.clusters?.length ?? 0) > 0}>
          <div
            data-cactus-cluster-labels
            style={{
              transform: `translate(${transform().x}px, ${transform().y}px) scale(${transform().k})`,
              "transform-origin": '0 0',
              position: 'absolute',
              inset: '0',
              "pointer-events": 'none',
            }}
          >
            <ClusterUnderlay clusters={props.clusters!} getNodeRects={getNodeRects} zoomScale={() => transform().k} layer="labels" />
          </div>
        </Show>

        <Show when={(props.edges?.length ?? 0) > 0}>
          <svg data-cactus-edge-layer-labels width="100%" height="100%" style={{ position: 'absolute', inset: '0', "pointer-events": 'none' }}>
            <g transform={`translate(${transform().x}, ${transform().y}) scale(${transform().k})`}>
              <EdgeLayer edges={props.edges!} getNodeRects={getNodeRects} layer="labels" zoom={() => transform().k} viewport={edgeViewport} />
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

        <Show when={marqueeRect()}>
          {(rect) => (
            <div
              style={{
                position: 'absolute',
                left: `${rect().x}px`,
                top: `${rect().y}px`,
                width: `${rect().width}px`,
                height: `${rect().height}px`,
                border: '1px solid var(--cactus-accent, #2563eb)',
                "background-color": 'var(--cactus-selection, rgba(37, 99, 235, 0.1))',
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
