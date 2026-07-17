import { For, createMemo, createEffect, createSignal, on, type JSX } from 'solid-js';
import type { AtlasAction, AtlasColorToken, AtlasContentMode, AtlasDocument } from '@luminous/core/atlas';
import { applyAtlasBatch, invertAtlasBatch } from '@luminous/core/atlas';
import { Canvas, NodeContainer, useCanvasContext, useGesture, findContainerAt } from '@luminous/cactus';
import type { CanvasRef, ChromeSchema, MenuSchema, MenuItem } from '@luminous/cactus';
import {
  toEdgeDeclarations,
  projectAtlasNodes,
  childAreaOrigin,
  containerHeaderHeight,
  type AtlasRenderNode,
} from './projection.ts';
import {
  buildContentEditPatch,
  buildModePatch,
  buildColorPatch,
  uniqueId,
  buildDuplicateActions,
  selfAndDescendantIds,
  resolveDrop,
  describePendingDrop,
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

/** `id` and every ancestor reached by following `parentOf` upward. */
export function selfAndAncestors(id: string, parentOf: Map<string, string>): string[] {
  const result = [id];
  let current = parentOf.get(id);
  while (current !== undefined) {
    result.push(current);
    current = parentOf.get(current);
  }
  return result;
}

export interface AtlasCanvasProps {
  doc: AtlasDocument;
  dispatchDoc: (next: AtlasDocument) => void;
  /** R6: fires with a preview message while a drag is about to change Container
   * membership, and with `null` once it isn't (including at drag end). */
  onPendingMembershipChange?: (message: string | null) => void;
  onDropRefused?: (message: string) => void;
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
  /** The Color to draw a Node in — the preview override when this node is
   * being previewed, else its own `node.color`. Never written to the Document. */
  effectiveColor: (nodeId: string) => AtlasColorToken | undefined;
  /** The live content-height drag preview — `undefined` outside of a drag,
   * same pattern as color preview. */
  previewContentHeight: () => { nodeId: string; height: number } | undefined;
  onResizePreview: (nodeId: string, height: number | undefined) => void;
  onResizeCommit: (nodeId: string, height: number) => void;
}): JSX.Element {
  const ctx = useCanvasContext();

  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: (nodeId) => props.onDragStart(nodeId),
      onDragEnd: (nodeId, dx, dy) => props.onDragEnd(nodeId, dx, dy),
    },
  });

  const parentOf = createMemo(() => {
    const m = new Map<string, string>();
    for (const rn of props.nodes()) if (rn.node.parent) m.set(rn.node.id, rn.node.parent);
    return m;
  });

  return (
    <For each={props.nodes()}>
      {(rn) => {
        const editing = () => props.editingId() === rn.node.id;
        const color = () => props.effectiveColor(rn.node.id);
        // The container-tint override lives on this wrapper, an ancestor of
        // NodeContainer's own root div — CSS custom properties inherit down
        // to the soft-container div NodeContainer renders, so this reaches it
        // with no color-shaped change to cactus (see NodeContainer.tsx:74).
        const wrapperStyle = (): JSX.CSSProperties => {
          const token = color();
          return token ? { '--cactus-container-tint': `var(--color-atlas-${token}-container)` } : {};
        };
        // Read the drag offset per-row from the gesture, not from a mapped
        // render-node object — nodes() stays reference-stable during a drag,
        // so <For> never disposes/rebuilds this row (see 1b in the task spec).
        // A row moves when the dragged Node is itself or any ancestor, so a
        // container drag carries its whole subtree along live.
        const movedByDrag = () => {
          for (const id of selfAndAncestors(rn.node.id, parentOf())) {
            if (gesture.isDraggingNode(id)) return true;
          }
          return false;
        };
        const dx = () => (movedByDrag() ? gesture.dragDelta().dx : 0);
        const dy = () => (movedByDrag() ? gesture.dragDelta().dy : 0);
        // A live content-height drag grows/shrinks this row's own box: for a
        // container, the header band grows by the same delta as its box; for
        // a leaf, the whole box height IS the preview.
        const resizePreview = () => {
          const p = props.previewContentHeight();
          return p && p.nodeId === rn.node.id ? p.height : undefined;
        };
        return (
          <div style={wrapperStyle()}>
            <NodeContainer
              nodeId={rn.node.id}
              x={() => rn.x + dx()}
              y={() => rn.y + dy()}
              w={() => rn.w}
              h={() => {
                if (editing()) return EDIT_HEIGHT;
                const preview = resizePreview();
                if (preview === undefined) return rn.h;
                return rn.hasChildren ? rn.h - containerHeaderHeight(rn.node) + preview : preview;
              }}
              softContainer={() => rn.hasChildren}
              onPointerDown={(e) => {
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
                previewHeight={resizePreview}
                zoomScale={() => ctx.transform().k}
                onResizePreview={(height) => props.onResizePreview(rn.node.id, height)}
                onResizeCommit={(height) => props.onResizeCommit(rn.node.id, height)}
              />
            </NodeContainer>
          </div>
        );
      }}
    </For>
  );
}

export function AtlasCanvas(props: AtlasCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  const [editingId, setEditingId] = createSignal<string | null>(null);

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

  // Content-height resize: a local-only live preview (mirrors previewColor)
  // until release, when it's dispatched as one undoable setNode and cleared.
  const [previewContentHeight, setPreviewContentHeight] = createSignal<{ nodeId: string; height: number } | undefined>();
  function resizeContent(nodeId: string, height: number) {
    setPreviewContentHeight(undefined);
    dispatchAction([{ type: 'setNode', id: nodeId, contentHeight: height }], 'Resize Content');
  }

  const nodes = createMemo(() => projectAtlasNodes(props.doc));
  const nodesById = createMemo(() => new Map(props.doc.nodes.map((n) => [n.id, n])));
  const edges = createMemo(() => toEdgeDeclarations(props.doc));

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
      props.onPendingMembershipChange?.(describePendingDrop(props.doc, nodeId, lastHit));
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

    const newParentId = hitContainerId ?? undefined;
    const parentRn = newParentId ? nodes().find((n) => n.node.id === newParentId) : undefined;
    const droppedAbs = { x: rn.x + dx, y: rn.y + dy };
    const parentAbs = parentRn ? { x: parentRn.x, y: parentRn.y } : undefined;

    const outcome = resolveDrop(props.doc, nodeId, hitContainerId);
    if (outcome.changed && !outcome.result.ok) {
      props.onDropRefused?.(outcome.result.error);
      return;
    }
    // A dropped Node's stored position is relative to its parent's child-area
    // origin, not the parent's top-left corner — must match applyDrop's inverse.
    const origin = parentAbs ? childAreaOrigin(parentRn?.node) : { x: 0, y: 0 };
    const relX = droppedAbs.x - (parentAbs?.x ?? 0) - origin.x;
    const relY = droppedAbs.y - (parentAbs?.y ?? 0) - origin.y;
    const actions: AtlasAction[] = [];
    if (outcome.changed) actions.push({ type: 'reparent', id: nodeId, parent: newParentId });
    actions.push({ type: 'setNode', id: nodeId, x: relX, y: relY });
    dispatchAction(actions, 'Move Node');
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
            effectiveColor={effectiveColor}
            previewContentHeight={previewContentHeight}
            onResizePreview={(nodeId, height) =>
              setPreviewContentHeight(height === undefined ? undefined : { nodeId, height })
            }
            onResizeCommit={resizeContent}
          />
        </Canvas>
      </div>
    </>
  );
}
