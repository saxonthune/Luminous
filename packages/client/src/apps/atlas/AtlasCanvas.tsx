import { For, Show, createMemo, createEffect, createSignal, on, type JSX } from 'solid-js';
import type { AtlasAction, AtlasColorToken, AtlasContentMode, AtlasDocument } from '@luminous/core/atlas';
import { applyAtlasBatch, invertAtlasBatch } from '@luminous/core/atlas';
import {
  Canvas,
  NodeContainer,
  ConnectionPreview,
  useCanvasContext,
  useGesture,
  findContainerAt,
  isOverContainerInterior,
} from '@luminous/cactus';
import type { CanvasRef, ChromeSchema, MenuSchema, MenuItem } from '@luminous/cactus';
import {
  toEdgeDeclarations,
  projectAtlasNodes,
  childAreaOrigin,
  containerHeaderHeight,
  CONTAINER_BEZEL,
  type AtlasRenderNode,
} from './projection.ts';
import {
  addDelta,
  growAncestors,
  shiftSubtree,
  type LayoutDelta,
} from './layoutOverride.ts';
import {
  buildContentEditPatch,
  buildModePatch,
  buildColorPatch,
  uniqueId,
  buildDuplicateActions,
  selfAndDescendantIds,
  resolveDrop,
  describePendingDrop,
  canConnect,
  buildConnectDropActions,
  type NodeEditForm,
} from './mutations.ts';
import { AtlasNodeContent } from './AtlasNodeContent.tsx';
import { ColorSwatchGrid } from './ColorSwatchGrid.tsx';
import { buildArrangeAsColumnActions, sameParent } from './arrange.ts';
import { useAtlasHistory } from './history.ts';

// Scoped styling for the rendered markdown Content — mirrors dataflow's
// BoxContent MD_STYLES but scoped under its own class.
const ATLAS_NODE_MD_STYLES = `
.atlas-node-md p { margin: 0 0 .35rem; }
.atlas-node-md ul { margin: 0 0 .35rem; padding-left: 1rem; list-style: disc; }
.atlas-node-md li { margin: .1rem 0; }
.atlas-node-md code { font-family: ui-monospace, monospace; background: var(--cactus-surface-alt, #f3f4f6); padding: .05rem .25rem; border-radius: 3px; font-size: .9em; }
.atlas-node-md strong { font-weight: 600; }
.atlas-node-md > :last-child { margin-bottom: 0; }
`;

// Fixed edit-mode height for a Node being edited — mirrors DataflowCanvas's
// EDIT_HEIGHT (v1, no content-driven auto-grow).
const EDIT_HEIGHT = 220;

// Edge Tab geometry (R44): a small circular badge protruding from the top of
// a Node's right side. The overlap pulls it a couple px onto the Node so it
// reads as attached rather than floating.
const EDGE_TAB_SIZE = 22;
const EDGE_TAB_OVERLAP = 6;
const EDGE_TAB_TOP_OFFSET = 8;

export interface AtlasCanvasProps {
  doc: AtlasDocument;
  dispatchDoc: (next: AtlasDocument) => void;
  /** R6: fires with a preview message while a drag is about to change Container
   * membership, and with `null` once it isn't (including at drag end). */
  onPendingMembershipChange?: (message: string | null) => void;
  onDropRefused?: (message: string) => void;
  /** R51: fires with a toast message while a preview Edge is drawn, and with
   * `null` once it isn't (including at completion or cancel). */
  onEdgePreviewChange?: (message: string | null) => void;
}

/**
 * Renders the node layer inside <Canvas>'s provider — registerNodeRect and
 * hit-testing need useCanvasContext, which only resolves inside Canvas's
 * children (see the same constraint noted at DataflowCanvas.tsx:57-61).
 */
function AtlasNodeLayer(props: {
  nodes: () => AtlasRenderNode[];
  editingId: () => string | null;
  onEnterEdit: (id: string) => void;
  onCommit: (id: string, form: NodeEditForm) => void;
  onCancel: () => void;
  onModeChange: (id: string, mode: AtlasContentMode) => void;
  onDragStart: (nodeId: string) => void;
  onDragEnd: (nodeId: string, dx: number, dy: number) => void;
  /** Whether Ctrl/Meta is currently held during an active drag — see
   * `beginCtrlTracking` on AtlasCanvas. */
  ctrlHeld: () => boolean;
  /** Fired synchronously on a node's pointerdown, before `useGesture` gets it
   * — seeds ctrlHeld tracking from the initiating event. */
  onPressStart: (e: PointerEvent) => void;
  /** The Color to draw a Node in — the preview override when this node is
   * being previewed, else its own `node.color`. Never written to the Document. */
  effectiveColor: (nodeId: string) => AtlasColorToken | undefined;
  /** The live content-size drag preview — `undefined` outside of a drag,
   * same pattern as color preview. Either dimension may be absent: an edge
   * grip drags one, a corner grip drags both. */
  previewContentSize: () => { nodeId: string; width?: number; height?: number } | undefined;
  onResizePreview: (nodeId: string, size: { width?: number; height?: number } | undefined) => void;
  onResizeCommit: (nodeId: string, size: { width?: number; height?: number }) => void;
  onEdgePreviewChange?: (message: string | null) => void;
  /** Whether completing the in-progress Edge into `target` would create it —
   * `canConnect` against the live Document, which this layer doesn't hold. */
  connectValid: (source: string, target: string) => boolean;
}): JSX.Element {
  const ctx = useCanvasContext();

  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: (nodeId) => props.onDragStart(nodeId),
      onDragEnd: (nodeId, dx, dy) => props.onDragEnd(nodeId, dx, dy),
    },
  });

  // R51: a toast that says what completing the gesture right now would do —
  // recomputed as the pointer moves (drag state carries the screen position)
  // and as Ctrl toggles. It states the pending outcome, never instructions;
  // the one allowed extra is the Ctrl hint parenthetical, gone while held.
  createEffect(() => {
    const drag = ctx.connectionDrag();
    if (!drag) {
      props.onEdgePreviewChange?.(null);
      return;
    }
    const nameOf = (id: string) => props.nodes().find((rn) => rn.node.id === id)?.node.name ?? id;
    const source = nameOf(drag.sourceNodeId);
    if (ctx.ctrlHeld()) {
      // Mirrors onConnectDrop: the new Node's parent is the container under
      // the pointer, top-level when there is none.
      const parentId = findContainerAt(drag.currentScreenX, drag.currentScreenY);
      props.onEdgePreviewChange?.(
        parentId
          ? `Creating new node in "${nameOf(parentId)}" with edge from "${source}"`
          : `Creating new node with edge from "${source}"`,
      );
      return;
    }
    // Mirrors the gesture's completion hit-test (useGesture.ts): the Node
    // under the pointer, counted only when the Edge would actually be created.
    const targetId =
      document
        .elementsFromPoint(drag.currentScreenX, drag.currentScreenY)
        .find((el) => el.hasAttribute('data-connection-target'))
        ?.getAttribute('data-node-id') ?? null;
    const base =
      targetId !== null && props.connectValid(drag.sourceNodeId, targetId)
        ? `Creating new edge from "${source}" to "${nameOf(targetId)}"`
        : `Creating new edge from "${source}"`;
    props.onEdgePreviewChange?.(`${base} (hint: hold ctrl to add a new node)`);
  });

  const parentOf = createMemo(() => {
    const m = new Map<string, string>();
    for (const rn of props.nodes()) if (rn.node.parent) m.set(rn.node.id, rn.node.parent);
    return m;
  });
  const childrenOf = createMemo(() => {
    const m = new Map<string, string[]>();
    for (const rn of props.nodes()) {
      if (rn.node.parent === undefined) continue;
      const list = m.get(rn.node.parent) ?? [];
      list.push(rn.node.id);
      m.set(rn.node.parent, list);
    }
    return m;
  });

  // The one live-override map every row reads uniformly (see layoutOverride.ts):
  // built from whichever gesture is active, so a released gesture leaves the
  // map empty and rows fall back to their committed geometry — snap-back is
  // just the absence of an override, no revert code needed.
  const layoutDeltas = createMemo(() => {
    const map = new Map<string, LayoutDelta>();

    // Move (R-drag): the dragged Node and its whole subtree translate live.
    const g = gesture.gesture();
    if (g.kind === 'draggingNode') {
      const { dx, dy } = gesture.dragDelta();
      shiftSubtree(map, g.nodeId, childrenOf(), dx, dy, { includeRoot: true });
      // Ctrl-expand (R5): each ancestor on the dragged Node's path also grows
      // live to contain its dragged position — composes with the shift above.
      if (props.ctrlHeld()) {
        growAncestors(map, g.nodeId, parentOf(), props.nodes(), { dx, dy });
      }
    }

    // Content-resize: the resized Node's own box grows by the width/height
    // delta, for both a leaf and a container — a container's frame grip
    // sizes the container box (the shrink-wrap floor, projection.ts), so it
    // never shifts children; it only adds empty room past their extent.
    // Ancestors grow once, from both deltas together, to contain the resized
    // Node — matching the committed re-projection of the same
    // contentWidth/contentHeight (see projection.ts's shrinkWrapSize).
    const preview = props.previewContentSize();
    if (preview) {
      const rn = props.nodes().find((n) => n.node.id === preview.nodeId);
      if (rn) {
        const ownDelta: Partial<{ dw: number; dh: number }> = {};
        if (preview.width !== undefined) {
          const dw = preview.width - rn.w;
          addDelta(map, preview.nodeId, { dw });
          ownDelta.dw = dw;
        }
        if (preview.height !== undefined) {
          const dh = preview.height - rn.h;
          addDelta(map, preview.nodeId, { dh });
          ownDelta.dh = dh;
        }
        growAncestors(map, preview.nodeId, parentOf(), props.nodes(), ownDelta);
      }
    }

    return map;
  });
  const ZERO_DELTA: LayoutDelta = { dx: 0, dy: 0, dw: 0, dh: 0 };

  return (
    <For each={props.nodes()}>
      {(rn) => {
        const editing = () => props.editingId() === rn.node.id;
        const color = () => props.effectiveColor(rn.node.id);
        // R45: the tab shows on hover — enter/leave on the row wrapper use
        // subtree semantics, so hover holds while the pointer moves from the
        // Node onto the tab (a sibling inside the same wrapper).
        const [hovered, setHovered] = createSignal(false);
        const isEdgeSource = () => ctx.connectionDrag()?.sourceNodeId === rn.node.id;
        const tabVisible = () => hovered() || isEdgeSource();
        // The container box is color-neutral: a node's color identifies the
        // node itself (its header/leaf fill), never the region its children
        // sit in. So the soft-container tint is a fixed grey regardless of
        // this node's color, and the border is the theme's plain border for a
        // legible boundary. These CSS custom properties inherit down to the
        // soft-container div NodeContainer renders (see NodeContainer.tsx:73).
        const wrapperStyle = (): JSX.CSSProperties => ({
          '--cactus-node-bezel': 'var(--surface)',
          '--cactus-node-border': 'var(--border)',
          '--cactus-node-radius': '8px',
          '--cactus-container-tint': 'var(--atlas-container-fill)',
          '--cactus-container-border': 'var(--border)',
        });
        // The row applies the composed override uniformly — nodes() stays
        // reference-stable during a gesture, so <For> never disposes/rebuilds
        // this row (see 1b in the task spec).
        const delta = () => layoutDeltas().get(rn.node.id) ?? ZERO_DELTA;
        // Passed to AtlasNodeContent for its own edit-mode UI — geometry
        // (the box growing/shifting) is handled by `delta` above instead.
        const resizePreview = () => {
          const p = props.previewContentSize();
          return p && p.nodeId === rn.node.id ? { width: p.width, height: p.height } : undefined;
        };
        return (
          <div style={wrapperStyle()} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <NodeContainer
              nodeId={rn.node.id}
              x={() => rn.x + delta().dx}
              y={() => rn.y + delta().dy}
              w={() => rn.w + delta().dw}
              h={() => (editing() ? EDIT_HEIGHT : rn.h + delta().dh)}
              softContainer={() => rn.hasChildren}
              containerInset={() => ({
                top: containerHeaderHeight(rn.node),
                left: CONTAINER_BEZEL,
                right: CONTAINER_BEZEL,
                bottom: CONTAINER_BEZEL,
              })}
              onPointerDown={(e) => {
                // R36: a container Node moves only from its header/frame — a
                // press on its soft-container interior falls through
                // untouched (no beginPress, no stopPropagation) so the
                // canvas-level marquee listener (useGesture's boxSelect,
                // relaxed for `[data-soft-container]` in useGesture.ts) sees
                // it instead. A leaf has no interior, so it always moves.
                if (rn.hasChildren && isOverContainerInterior(e.currentTarget as Element, e.clientX, e.clientY)) {
                  return;
                }
                props.onPressStart(e);
                ctx.onNodePointerDown(rn.node.id, e);
                gesture.beginPress(rn.node.id, e);
              }}
            >
              <AtlasNodeContent
                node={() => rn.node}
                hasChildren={() => rn.hasChildren}
                color={color}
                selected={() => ctx.isSelected(rn.node.id)}
                editing={editing}
                onEnterEdit={() => props.onEnterEdit(rn.node.id)}
                onCommit={(form) => props.onCommit(rn.node.id, form)}
                onCancel={props.onCancel}
                onModeChange={(mode) => props.onModeChange(rn.node.id, mode)}
                previewSize={resizePreview}
                frameSize={() => ({ width: rn.w, height: rn.h })}
                zoomScale={() => ctx.transform().k}
                onResizePreview={(size) => props.onResizePreview(rn.node.id, size)}
                onResizeCommit={(size) => props.onResizeCommit(rn.node.id, size)}
              />
            </NodeContainer>
            {/* Edge Tab (R44): a sibling of NodeContainer, not a child — the
                container's root div clips overflow, which would hide a tab
                protruding past its right edge. */}
            <div
              data-testid={`edge-tab-${rn.node.id}`}
              data-no-pan="true"
              style={{
                position: 'absolute',
                left: `${rn.x + delta().dx + rn.w + delta().dw - EDGE_TAB_OVERLAP}px`,
                top: `${rn.y + delta().dy + EDGE_TAB_TOP_OFFSET}px`,
                width: `${EDGE_TAB_SIZE}px`,
                height: `${EDGE_TAB_SIZE}px`,
                'z-index': '5',
                opacity: tabVisible() ? '1' : '0',
                transition: 'opacity 150ms ease',
                'pointer-events': tabVisible() ? 'auto' : 'none',
                cursor: 'pointer',
              }}
              on:pointerdown={(e: PointerEvent) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                ctx.startConnection(rn.node.id, null, e.clientX, e.clientY);
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  'border-radius': '9999px',
                  background: 'var(--atlas-edge-tab-fill)',
                  color: 'var(--atlas-edge-tab-glyph)',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'font-size': '15px',
                  'line-height': '1',
                  'font-weight': '600',
                  'box-shadow': isEdgeSource()
                    ? '0 0 0 3px var(--atlas-edge-tab-fill)'
                    : 'var(--cactus-shadow-sm, none)',
                  transform: isEdgeSource() ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                }}
              >
                +
              </div>
            </div>
          </div>
        );
      }}
    </For>
  );
}

export function AtlasCanvas(props: AtlasCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [selectedCount, setSelectedCount] = createSignal(0);

  const history = useAtlasHistory();
  // Set just before an own dispatch reaches props.dispatchDoc so the
  // reload-guard effect below can tell "our own edit echoing back down"
  // from "the Document changed under us" and only clear history for the
  // latter (R-preserve external-reload clears history).
  let isEcho = false;

  /** The seam every user edit routes through: applies `actions`, records the
   * inverse for undo, marks the resulting `dispatchDoc` call as an echo, and
   * pushes the new Document down. A failed batch is surfaced via
   * `onDropRefused` and never dispatched or recorded. */
  function dispatchAction(actions: AtlasAction[], label: string): void {
    if (actions.length === 0) return;
    const before = props.doc;
    const result = applyAtlasBatch(before, actions);
    if (!result.ok) {
      props.onDropRefused?.(result.error);
      return;
    }
    history.record({ label, do: actions, undo: invertAtlasBatch(before, actions) });
    isEcho = true;
    props.dispatchDoc(result.doc);
  }

  /** Applies `actions` (from undo/redo) without recording a new entry. */
  function applyHistoryActions(actions: AtlasAction[]): void {
    const result = applyAtlasBatch(props.doc, actions);
    if (!result.ok) {
      props.onDropRefused?.(result.error);
      return;
    }
    isEcho = true;
    props.dispatchDoc(result.doc);
  }

  function undo(): void {
    const actions = history.undo();
    if (actions) applyHistoryActions(actions);
  }

  function redo(): void {
    const actions = history.redo();
    if (actions) applyHistoryActions(actions);
  }

  // A genuine external reload (a non-echo props.doc change, e.g. a remote
  // write) invalidates every recorded action's preimage, so history must be
  // cleared. Our own dispatches flow through the same prop and must not
  // clear it — the isEcho flag set in dispatchAction/applyHistoryActions
  // distinguishes the two.
  createEffect(on(() => props.doc, () => {
    if (isEcho) {
      isEcho = false;
      return;
    }
    history.clear();
  }));

  // Color preview: a local-only signal, scoped to the node being previewed so
  // one node's hover can never tint another. Never passed to dispatchDoc.
  const [previewColor, setPreviewColor] = createSignal<{ nodeId: string; token: AtlasColorToken | undefined } | undefined>();
  function effectiveColor(nodeId: string): AtlasColorToken | undefined {
    const preview = previewColor();
    if (preview && preview.nodeId === nodeId) return preview.token;
    return nodesById().get(nodeId)?.color;
  }

  // Content-size resize: a local-only live preview (mirrors previewColor)
  // until release, when it's dispatched as one undoable setNode and cleared.
  const [previewContentSize, setPreviewContentSize] = createSignal<
    { nodeId: string; width?: number; height?: number } | undefined
  >();
  function resizeContent(nodeId: string, size: { width?: number; height?: number }) {
    setPreviewContentSize(undefined);
    const action: AtlasAction = { type: 'setNode', id: nodeId };
    if (size.width !== undefined) action.contentWidth = size.width;
    if (size.height !== undefined) action.contentHeight = size.height;
    dispatchAction([action], 'Resize Content');
  }

  const nodes = createMemo(() => projectAtlasNodes(props.doc));
  const nodesById = createMemo(() => new Map(props.doc.nodes.map((n) => [n.id, n])));
  const edges = createMemo(() => toEdgeDeclarations(props.doc));

  // R5: whether Ctrl/Meta is held during the current drag. Ctrl can be
  // pressed/released mid-drag with no pointer event, so it's tracked via
  // keydown/keyup while a press is active, seeded from the pointerdown event
  // that started the press. Cleared on the matching pointerup — a click that
  // never becomes a drag clears it the same way a drag's end does.
  const [ctrlHeld, setCtrlHeld] = createSignal(false);
  let ctrlTrackingActive = false;
  function beginCtrlTracking(e: PointerEvent) {
    setCtrlHeld(e.ctrlKey || e.metaKey);
    if (ctrlTrackingActive) return;
    ctrlTrackingActive = true;
    const handleKeyDown = (ke: KeyboardEvent) => {
      if (ke.key === 'Control' || ke.key === 'Meta') setCtrlHeld(true);
    };
    const handleKeyUp = (ke: KeyboardEvent) => {
      if (ke.key === 'Control' || ke.key === 'Meta') setCtrlHeld(false);
    };
    const handlePointerUp = () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerup', handlePointerUp);
      ctrlTrackingActive = false;
      setCtrlHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerup', handlePointerUp);
  }

  let dragStart: { id: string; x: number; y: number } | null = null;
  let lastHit: string | null = null;
  let dragPointerMove: ((e: PointerEvent) => void) | null = null;

  function beginDrag(nodeId: string) {
    const rn = nodes().find((n) => n.node.id === nodeId);
    if (!rn) return;
    dragStart = { id: nodeId, x: rn.x, y: rn.y };
    lastHit = null;
    const exclude = selfAndDescendantIds(props.doc, nodeId);
    // eslint-disable-next-line solid/reactivity -- pointermove callback, not a render path; props.doc is read fresh on each invocation
    dragPointerMove = (e: PointerEvent) => {
      lastHit = findContainerAt(e.clientX, e.clientY, exclude);
      // R5: Ctrl held means the Node stays a member of its current
      // Container — no membership change is pending, so the toast is silent.
      props.onPendingMembershipChange?.(ctrlHeld() ? null : describePendingDrop(props.doc, nodeId, lastHit));
    };
    window.addEventListener('pointermove', dragPointerMove);
  }

  // A drop persists the Node's new parent-relative x/y so it no longer snaps
  // back to its computed slot (see doc01.07.04 R24-R26). Reparenting composes
  // with the position write: resolveDrop's reparent applies first, then the
  // position is written relative to the (possibly new) parent.
  function endDrag(nodeId: string, dx: number, dy: number) {
    if (dragPointerMove) {
      window.removeEventListener('pointermove', dragPointerMove);
      dragPointerMove = null;
    }
    props.onPendingMembershipChange?.(null);
    dragStart = null;

    const hitContainerId = lastHit;
    lastHit = null;

    const rn = nodes().find((n) => n.node.id === nodeId);
    if (!rn) return;

    // R5: Ctrl held keeps the Node in its current Container — skip the
    // reparent entirely (hitContainerId is ignored) and persist position
    // relative to that same parent. Shrink-wrap then makes the expansion
    // permanent since the Node's committed position now sits at its dragged
    // spot inside the unchanged parent.
    const ctrl = ctrlHeld();
    const newParentId = ctrl ? rn.node.parent : (hitContainerId ?? undefined);
    const parentRn = newParentId ? nodes().find((n) => n.node.id === newParentId) : undefined;
    const droppedAbs = { x: rn.x + dx, y: rn.y + dy };
    const parentAbs = parentRn ? { x: parentRn.x, y: parentRn.y } : undefined;

    const actions: AtlasAction[] = [];
    if (!ctrl) {
      const outcome = resolveDrop(props.doc, nodeId, hitContainerId);
      if (outcome.changed && !outcome.result.ok) {
        props.onDropRefused?.(outcome.result.error);
        return;
      }
      if (outcome.changed) actions.push({ type: 'reparent', id: nodeId, parent: newParentId });
    }
    // A dropped Node's stored position is relative to its parent's child-area
    // origin, not the parent's top-left corner — must match applyDrop's inverse.
    const origin = parentAbs ? childAreaOrigin(parentRn?.node) : { x: 0, y: 0 };
    const relX = droppedAbs.x - (parentAbs?.x ?? 0) - origin.x;
    const relY = droppedAbs.y - (parentAbs?.y ?? 0) - origin.y;
    actions.push({ type: 'setNode', id: nodeId, x: relX, y: relY });
    dispatchAction(actions, 'Move Node');
  }

  // R47/R48: a completed connection (drag-release or click-to-arm-then-click)
  // always targets a Node validated by canConnect via isValidConnection below.
  function onConnect(c: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) {
    dispatchAction([{ type: 'addEdge', from: c.source, to: c.target }], 'Add Edge');
  }

  // R52: Ctrl + release/click completes the Edge into a fresh Node instead —
  // a plain (non-Ctrl) release/click over the background is just a cancel.
  function onConnectDrop(info: { source: string; sourceHandle: string | null; clientX: number; clientY: number; ctrlKey: boolean }) {
    if (!info.ctrlKey || !canvasRef) return;
    const parentId = findContainerAt(info.clientX, info.clientY);
    const droppedAbs = canvasRef.screenToCanvas(info.clientX, info.clientY);
    const parentRn = parentId ? nodes().find((n) => n.node.id === parentId) : undefined;
    const parentAbs = parentRn ? { x: parentRn.x, y: parentRn.y } : undefined;
    dispatchAction(buildConnectDropActions(props.doc, info.source, parentId, droppedAbs, parentAbs), 'Add Node');
  }

  function enterEdit(id: string) {
    setEditingId(id);
  }

  function commitEdit(id: string, form: NodeEditForm) {
    const node = nodesById().get(id);
    setEditingId(null);
    if (!node) return;
    const patch = buildContentEditPatch(form, node.name, node.content?.mode);
    dispatchAction([{ type: 'setNode', id, ...patch }], 'Edit Node');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function changeMode(id: string, mode: AtlasContentMode) {
    const node = nodesById().get(id);
    if (!node) return;
    const patch = buildModePatch(node.content, mode);
    dispatchAction([{ type: 'setNode', id, ...patch }], 'Change Mode');
  }

  // Drop out of edit mode if the document reloads out from under the editing
  // node (e.g. a remote, non-echo change) — see DataflowCanvas.tsx:215-220.
  createEffect(on(() => props.doc, (doc) => {
    const id = editingId();
    if (id && !doc.nodes.some((n) => n.id === id)) setEditingId(null);
  }));

  // R23: the camera moves only on pan, zoom, or the fit control. Nothing here
  // may move it in response to a Document change.
  function fitAll() {
    const list = nodes();
    if (!canvasRef || list.length === 0) return;
    const rects = list.map((n) => ({ x: n.x, y: n.y, width: n.w, height: n.h }));
    canvasRef.fitView(rects, 64);
  }

  function selectColor(nodeId: string, token: AtlasColorToken) {
    setPreviewColor(undefined);
    const patch = buildColorPatch(token);
    dispatchAction([{ type: 'setNode', id: nodeId, ...patch }], 'Set Color');
  }

  function nodeContextMenu(nodeId: string): MenuSchema | undefined {
    const items: MenuItem[] = [
      { type: 'action', action: { id: 'node.duplicate', label: 'Duplicate', payload: { id: nodeId } } },
      { type: 'action', action: { id: 'node.add', label: 'Add Node', payload: { parent: nodeId } } },
      { type: 'divider' },
      {
        type: 'submenu',
        label: 'Color',
        items: [
          {
            type: 'custom',
            id: 'color-swatches',
            render: () => (
              <ColorSwatchGrid
                current={() => nodesById().get(nodeId)?.color}
                onPreview={(token) => setPreviewColor(token === undefined ? undefined : { nodeId, token })}
                onSelect={(token) => selectColor(nodeId, token)}
              />
            ),
          },
        ],
      },
    ];
    // R28/R29: only offered for a 2+-Node selection; disabled when the
    // selection spans different Containers rather than hidden, per the plan.
    const selectedIds = canvasRef?.getSelectedIds() ?? [];
    if (selectedIds.length >= 2) {
      items.push(
        { type: 'divider' },
        {
          type: 'submenu',
          label: 'Arrange as',
          items: [
            {
              type: 'action',
              action: {
                id: 'arrange.column',
                label: 'Column',
                enabled: sameParent(props.doc, [...selectedIds]),
                payload: { ids: [...selectedIds] },
              },
            },
          ],
        },
      );
    }
    // R53: Delete sits last, below a divider, so the destructive action never
    // neighbors the common ones.
    items.push(
      { type: 'divider' },
      { type: 'action', action: { id: 'node.delete', label: 'Delete', payload: { id: nodeId } } },
    );
    return { id: `node-menu-${nodeId}`, items };
  }

  function buildChrome(): ChromeSchema {
    return {
      top: [
        {
          id: 'atlas-history-toolbar',
          controls: [
            {
              type: 'button',
              action: { id: 'history.undo', label: 'Undo', hotkey: 'Mod+z', enabled: history.canUndo() },
            },
            {
              type: 'button',
              action: { id: 'history.redo', label: 'Redo', hotkey: 'Mod+Shift+z', enabled: history.canRedo() },
            },
          ],
        },
        {
          id: 'atlas-view-toolbar',
          controls: [{ type: 'button', action: { id: 'view.fit', label: 'Fit' } }],
        },
      ],
    };
  }

  function backgroundContextMenu(): MenuSchema | undefined {
    return {
      id: 'background-menu',
      items: [{ type: 'action', action: { id: 'node.add', label: 'Add Node', payload: {} } }],
    };
  }

  function onAction(id: string, payload?: unknown) {
    switch (id) {
      case 'view.fit': {
        fitAll();
        break;
      }
      case 'history.undo': {
        undo();
        break;
      }
      case 'history.redo': {
        redo();
        break;
      }
      case 'node.duplicate': {
        const { id: nodeId } = payload as { id: string };
        dispatchAction(buildDuplicateActions(props.doc, nodeId), 'Duplicate');
        break;
      }
      case 'node.add': {
        const { parent } = payload as { parent?: string };
        const existingIds = new Set(props.doc.nodes.map((n) => n.id));
        const newId = uniqueId('new-node', existingIds);
        const action: AtlasAction = { type: 'addNode', id: newId, name: 'New Node', parent };
        dispatchAction([action], 'Add Node');
        break;
      }
      case 'arrange.column': {
        const { ids } = payload as { ids: string[] };
        if (!sameParent(props.doc, ids)) break;
        dispatchAction(buildArrangeAsColumnActions(props.doc, ids), 'Arrange as Column');
        break;
      }
      case 'node.delete': {
        // R54: core's removeNode cascades to descendants and touching Edges;
        // the recorded inverse rebuilds all of it (history.ts invertRemoveNode).
        const { id: nodeId } = payload as { id: string };
        dispatchAction([{ type: 'removeNode', id: nodeId }], 'Delete Node');
        break;
      }
    }
  }

  return (
    <>
      <style>{ATLAS_NODE_MD_STYLES}</style>
      <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
        <Canvas
          ref={(r) => { canvasRef = r; }}
          edges={edges()}
          chrome={buildChrome()}
          nodeContextMenu={nodeContextMenu}
          backgroundContextMenu={backgroundContextMenu}
          onAction={onAction}
          onSelectionChange={(ids) => setSelectedCount(ids.length)}
          boxSelect={{
            trigger: 'drag',
            getNodeRects: () => nodes().map((rn) => ({ id: rn.node.id, x: rn.x, y: rn.y, width: rn.w, height: rn.h })),
          }}
          connectionDrag={{
            onConnect,
            onConnectDrop,
            isValidConnection: (c) => canConnect(props.doc, c.source, c.target),
          }}
          renderConnectionPreview={(coords) => (
            <ConnectionPreview
              d={`M ${coords.startX} ${coords.startY} L ${coords.currentX} ${coords.currentY}`}
              stroke="var(--atlas-edge-tab-fill)"
            />
          )}
        >
          <AtlasNodeLayer
            nodes={nodes}
            editingId={editingId}
            onEnterEdit={enterEdit}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            onModeChange={changeMode}
            onDragStart={beginDrag}
            onDragEnd={endDrag}
            ctrlHeld={ctrlHeld}
            onPressStart={beginCtrlTracking}
            effectiveColor={effectiveColor}
            previewContentSize={previewContentSize}
            onResizePreview={(nodeId, size) =>
              setPreviewContentSize(size === undefined ? undefined : { nodeId, ...size })
            }
            onResizeCommit={resizeContent}
            onEdgePreviewChange={props.onEdgePreviewChange}
            connectValid={(source, target) => canConnect(props.doc, source, target)}
          />
        </Canvas>
        <Show when={selectedCount() > 1}>
          <div
            data-testid="selection-count"
            class="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs text-fg shadow-sm"
          >
            {selectedCount()} Nodes selected
          </div>
        </Show>
      </div>
    </>
  );
}
