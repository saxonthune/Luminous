import { Show, createMemo, createEffect, createSignal, on, type JSX } from 'solid-js';
import type { AtlasAction, AtlasColorToken, AtlasContent, AtlasContentMode, AtlasData, AtlasDocument, AtlasPorts } from '@luminous/core/atlas';
import { applyAtlasBatch, invertAtlasBatch, resolveContent } from '@luminous/core/atlas';
import { Canvas, ConnectionPreview, findContainerAt } from '@luminous/cactus';
import type { CanvasRef } from '@luminous/cactus';
import { toEdgeDeclarations, projectAtlasNodes, childAreaOrigin, findContainerAtPoint } from './projection.ts';
import {
  buildContentEditPatch,
  buildModePatch,
  buildColorPatch,
  uniqueId,
  buildDuplicateActions,
  selectionRoots,
  selectionSubtreeIds,
  selfAndDescendantIds,
  resolveDrop,
  describePendingDrop,
  canConnect,
  connectDropAddsEdge,
  buildConnectDropActions,
  type NodeEditForm,
} from './mutations.ts';
import { chordHeld, chordKeys } from './inputBindings.ts';
import { measureContentFit, buildFitPatch, buildClearSizePatch, buildAutoFitPatch, type SizePatch } from './fitContent.ts';
import type { ContentResizeDirection } from './AtlasNodeContent.tsx';
import { AtlasNodeLayer } from './AtlasNodeLayer.tsx';
import { LegendOverlay } from './LegendOverlay.tsx';
import { nodeContextMenu, backgroundContextMenu, buildChrome, type AtlasMenuDeps } from './menus.tsx';
import { buildArrangeAsColumnActions, buildArrangeAsRowActions, buildRemoveOverlapActions, sameParent } from './arrange.ts';
import { buildGrowOnlyActions, sizeTouchedIds } from './growOnly.ts';
import { useAtlasHistory } from './history.ts';

// Scoped styling for the rendered markdown Content — mirrors dataflow's
// BoxContent MD_STYLES but scoped under its own class.
const ATLAS_NODE_MD_STYLES = `
.atlas-node-md p { margin: 0 0 .35rem; }
.atlas-node-md ul { margin: 0 0 .35rem; padding-left: 1rem; list-style: disc; }
.atlas-node-md li { margin: .1rem 0; }
.atlas-node-md code { font-family: ui-monospace, monospace; background: var(--cactus-surface-alt, #f3f4f6); padding: .05rem .25rem; border-radius: 3px; font-size: .9em; }
.atlas-node-md pre { margin: 0 0 .35rem; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--cactus-surface-alt, #f3f4f6); padding: .25rem .35rem; border-radius: 3px; }
.atlas-node-md pre code { background: none; padding: 0; }
.atlas-node-md strong { font-weight: 600; }
.atlas-node-md > :last-child { margin-bottom: 0; }
`;

export interface AtlasCanvasProps {
  doc: AtlasDocument;
  /** The Atlas Data File resolved for this Document, if one exists —
   * `undefined` is the normal case for most Atlas documents. */
  data?: AtlasData;
  dispatchDoc: (next: AtlasDocument) => void;
  /** R6: fires with a preview message while a drag is about to change Container
   * membership, and with `null` once it isn't (including at drag end). */
  onPendingMembershipChange?: (message: string | null) => void;
  onDropRefused?: (message: string) => void;
  /** R51: fires with a toast message while a preview Edge is drawn, and with
   * `null` once it isn't (including at completion or cancel). */
  onEdgePreviewChange?: (message: string | null) => void;
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
    // R95: a Container only ever grows — a batch that would shrink one gets
    // the size floor appended, so undo removes floor and cause together.
    let doc = result.doc;
    let recorded = actions;
    const floors = buildGrowOnlyActions(before, doc, sizeTouchedIds(actions));
    if (floors.length > 0) {
      const floored = applyAtlasBatch(doc, floors);
      if (floored.ok) {
        doc = floored.doc;
        recorded = [...actions, ...floors];
      }
    }
    history.record({ label, do: recorded, undo: invertAtlasBatch(before, recorded) });
    isEcho = true;
    props.dispatchDoc(doc);
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

  // R80: a Data File change discards the undo history — the client never
  // writes this file, so every change is external and needs no echo guard
  // (unlike props.doc above). `on`'s `defer: true` opts out of running on
  // the initial mount, else opening a Document with a sidecar already
  // loaded would clear an empty history for no reason.
  createEffect(on(() => props.data, () => {
    history.clear();
  }, { defer: true }));

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

  const [previewPorts, setPreviewPorts] = createSignal<{ nodeId: string; ports: AtlasPorts } | undefined>();
  const projectedDoc = createMemo<AtlasDocument>(() => {
    const preview = previewPorts();
    if (!preview) return props.doc;
    return { ...props.doc, nodes: props.doc.nodes.map((node) => node.id === preview.nodeId ? { ...node, ports: preview.ports } : node) };
  });
  const nodes = createMemo(() => projectAtlasNodes(props.doc));
  const nodesById = createMemo(() => new Map(props.doc.nodes.map((n) => [n.id, n])));
  const edges = createMemo(() => toEdgeDeclarations(projectedDoc()));
  const usedPorts = createMemo(() => {
    const parentOf = new Map(props.doc.nodes.map((node) => [node.id, node.parent]));
    const ancestors = (id: string) => { const out: string[] = []; let p = parentOf.get(id); while (p) { out.push(p); p = parentOf.get(p); } return out; };
    const used = new Set<string>();
    for (const edge of props.doc.edges) {
      const source = ancestors(edge.from);
      const target = ancestors(edge.to);
      const common = source.find((id) => target.includes(id));
      for (const id of common ? source.slice(0, source.indexOf(common)) : source) used.add(`${id}:exit`);
      const entries = common ? target.slice(0, target.indexOf(common)) : target;
      for (const id of entries) used.add(`${id}:entry`);
    }
    return used;
  });

  function commitPorts(nodeId: string, ports: AtlasPorts): void {
    setPreviewPorts(undefined);
    dispatchAction([{ type: 'setNode', id: nodeId, ports }], 'Move Port');
  }

  // R5: whether Ctrl/Meta is held during the current drag. Ctrl can be
  // pressed/released mid-drag with no pointer event, so it's tracked via
  // keydown/keyup while a press is active, seeded from the pointerdown event
  // that started the press. Cleared on the matching pointerup — a click that
  // never becomes a drag clears it the same way a drag's end does.
  const [ctrlHeld, setCtrlHeld] = createSignal(false);
  let ctrlTrackingActive = false;
  function beginCtrlTracking(e: PointerEvent) {
    setCtrlHeld(chordHeld('container.keepMembership', e));
    if (ctrlTrackingActive) return;
    ctrlTrackingActive = true;
    const handleKeyDown = (ke: KeyboardEvent) => {
      if (chordKeys('container.keepMembership').includes(ke.key)) setCtrlHeld(true);
    };
    const handleKeyUp = (ke: KeyboardEvent) => {
      if (chordKeys('container.keepMembership').includes(ke.key)) setCtrlHeld(false);
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

  let lastHit: string | null = null;
  let dragPointerMove: ((e: PointerEvent) => void) | null = null;

  // The Nodes moving together in the current drag (R69/R70): the selection's
  // Roots — selected Nodes with no selected ancestor — when the pressed Node
  // belongs to the selection and the Roots share one Parent (the same rule
  // R29 uses to enable arrange); otherwise just the pressed Node. Filtering
  // to Roots is what lets a marquee that swept a Container and its Children
  // still drag as a group: the Children travel inside their Root's subtree,
  // and moving them separately would shift them twice. A signal so
  // AtlasNodeLayer's live preview reads it.
  const [dragGroup, setDragGroup] = createSignal<string[]>([]);
  const [edgeRoutingFrozen, setEdgeRoutingFrozen] = createSignal(false);
  function resolveDragGroup(nodeId: string): string[] {
    const sel = canvasRef?.getSelectedIds() ?? [];
    if (!sel.includes(nodeId)) return [nodeId];
    const roots = selectionRoots(props.doc, [...sel]);
    if (roots.length === 0 || !sameParent(props.doc, roots)) return [nodeId];
    // The pressed Node is either a Root or inside one's subtree — either way
    // the Roots are the unit that moves.
    return roots;
  }

  function beginDrag(nodeId: string) {
    const rn = nodes().find((n) => n.node.id === nodeId);
    if (!rn) return;
    setEdgeRoutingFrozen(true);
    lastHit = null;
    const group = resolveDragGroup(nodeId);
    setDragGroup(group);
    const exclude = new Set<string>();
    for (const id of group) {
      for (const descId of selfAndDescendantIds(props.doc, id)) exclude.add(descId);
    }
    // Camera sampled once: screenToCanvas reads the container's bounding rect
    // (a forced layout flush once the drag's style writes land), and the
    // camera cannot move during a node drag (doc01.07.04 R23).
    const k = canvasRef?.getTransform().k ?? 1;
    const origin = canvasRef?.screenToCanvas(0, 0) ?? { x: 0, y: 0 };
    // eslint-disable-next-line solid/reactivity -- pointermove callback, not a render path; props.doc is read fresh on each invocation
    dragPointerMove = (e: PointerEvent) => {
      lastHit = findContainerAtPoint(nodes(), origin.x + e.clientX / k, origin.y + e.clientY / k, exclude);
      // R5: Ctrl held means the Node stays a member of its current
      // Container — no membership change is pending, so the toast is silent.
      props.onPendingMembershipChange?.(ctrlHeld() ? null : describePendingDrop(props.doc, group, lastHit));
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

    const hitContainerId = lastHit;
    lastHit = null;

    // The pressed Node may itself be absent from the group: dragging a
    // selected Child whose Container is a Root moves the Roots, and the
    // Child travels inside its Root's subtree.
    const group = dragGroup().length > 0 ? dragGroup() : [nodeId];
    setDragGroup([]);

    // R5: Ctrl held keeps each Node in its current Container — skip the
    // reparent entirely (hitContainerId is ignored) and persist position
    // relative to that same parent. Shrink-wrap then makes the expansion
    // permanent since the Node's committed position now sits at its dragged
    // spot inside the unchanged parent.
    const ctrl = ctrlHeld();
    const actions: AtlasAction[] = [];
    for (const id of group) {
      const rn = nodes().find((n) => n.node.id === id);
      if (!rn) continue;

      const newParentId = ctrl ? rn.node.parent : (hitContainerId ?? undefined);
      const parentRn = newParentId ? nodes().find((n) => n.node.id === newParentId) : undefined;
      const droppedAbs = { x: rn.x + dx, y: rn.y + dy };
      const parentAbs = parentRn ? { x: parentRn.x, y: parentRn.y } : undefined;

      if (!ctrl) {
        // R70: a drop refused for any member refuses the whole group — no
        // actions are dispatched and every Node snaps back together.
        const outcome = resolveDrop(props.doc, id, hitContainerId);
        if (outcome.changed && !outcome.result.ok) {
          props.onDropRefused?.(outcome.result.error);
          setEdgeRoutingFrozen(false);
          return;
        }
        if (outcome.changed) actions.push({ type: 'reparent', id, parent: newParentId });
      }
      // A dropped Node's stored position is relative to its parent's child-area
      // origin, not the parent's top-left corner — must match applyDrop's inverse.
      const origin = parentAbs ? childAreaOrigin(parentRn?.node) : { x: 0, y: 0 };
      const relX = droppedAbs.x - (parentAbs?.x ?? 0) - origin.x;
      const relY = droppedAbs.y - (parentAbs?.y ?? 0) - origin.y;
      actions.push({ type: 'setNode', id, x: relX, y: relY });
    }
    dispatchAction(actions, group.length > 1 ? 'Move Nodes' : 'Move Node');
    setEdgeRoutingFrozen(false);
  }

  // R47/R48: a completed connection (drag-release or click-to-arm-then-click)
  // always targets a Node validated by canConnect via isValidConnection below.
  function onConnect(c: { source: string; sourceHandle: string | null; target: string; targetHandle: string | null }) {
    dispatchAction([{ type: 'addEdge', from: c.source, to: c.target }], 'Add Edge');
  }

  // R52: Ctrl + release/click completes the Edge into a fresh Node instead —
  // a plain (non-Ctrl) release/click over the background is just a cancel.
  function onConnectDrop(info: { source: string; sourceHandle: string | null; clientX: number; clientY: number; ctrlKey: boolean }) {
    if (!chordHeld('edge.connectToNewNode', info) || !canvasRef) return;
    const parentId = findContainerAt(info.clientX, info.clientY);
    const droppedAbs = canvasRef.screenToCanvas(info.clientX, info.clientY);
    const parentRn = parentId ? nodes().find((n) => n.node.id === parentId) : undefined;
    const parentAbs = parentRn ? { x: parentRn.x, y: parentRn.y } : undefined;
    dispatchAction(buildConnectDropActions(props.doc, info.source, parentId, droppedAbs, parentAbs), 'Add Node');
  }

  function hasChildren(nodeId: string): boolean {
    return props.doc.nodes.some((n) => n.parent === nodeId);
  }

  /** The fit-to-content command (R72/R73), fired by a resize grip's double
   * click: a leaf with Content is measured and sized to it on the grip's
   * axes; a Container (whose content is its children) and a contentless leaf
   * instead drop their stored size on those axes, returning to the computed
   * size. One undoable setNode either way — never a continuous constraint. */
  function fitNodeToContent(nodeId: string, dir: ContentResizeDirection) {
    const node = nodesById().get(nodeId);
    if (!node) return;
    let patch: SizePatch;
    if (hasChildren(nodeId) || node.content === undefined) {
      patch = buildClearSizePatch(dir);
    } else {
      // R82: fit to the text the Node draws — resolveContent's Filled text
      // when a key fills it, else the authored text unchanged.
      const resolved = resolveContent(node.content, props.data);
      const fit = resolved ? measureContentFit(resolved) : null;
      if (!fit) return;
      patch = buildFitPatch(dir, fit);
    }
    dispatchAction([{ type: 'setNode', id: nodeId, ...patch }], 'Fit Node');
  }

  function commitEdit(id: string, form: NodeEditForm) {
    const node = nodesById().get(id);
    setEditingId(null);
    if (!node) return;
    const patch = buildContentEditPatch(form, node.name, node.content?.mode);
    // R74: a leaf still auto-sized on an axis (no stored size) adopts the
    // fitted size of the new Content in the same action; a user-set axis is
    // never overridden. Containers are child-sized, so they never auto-fit.
    let sizePatch: SizePatch = {};
    if (!hasChildren(id)) {
      // Mirrors core's setNode: the patch never mentions `from`, so the
      // Node's existing key (if any) survives this commit — measure what the
      // Node will actually draw after it, not just the freshly typed text.
      const finalContent: AtlasContent = node.content?.from !== undefined
        ? { ...patch.content, from: node.content.from }
        : patch.content;
      const resolved = resolveContent(finalContent, props.data);
      const fit = resolved ? measureContentFit(resolved) : null;
      if (fit) sizePatch = buildAutoFitPatch(node, fit);
    }
    dispatchAction([{ type: 'setNode', id, ...patch, ...sizePatch }], 'Edit Node');
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

  const menuDeps: AtlasMenuDeps = {
    doc: () => props.doc,
    nodeColor: (nodeId) => nodesById().get(nodeId)?.color,
    selectedIds: () => canvasRef?.getSelectedIds() ?? [],
    onPreviewColor: (nodeId, token) => setPreviewColor(token === undefined ? undefined : { nodeId, token }),
    onSelectColor: selectColor,
  };

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
      case 'selection.selectChildren': {
        const { ids } = payload as { ids: string[] };
        canvasRef?.setSelectedIds(ids);
        break;
      }
      case 'arrange.column': {
        const { ids } = payload as { ids: string[] };
        if (!sameParent(props.doc, ids)) break;
        dispatchAction(buildArrangeAsColumnActions(props.doc, ids), 'Arrange as Column');
        break;
      }
      case 'arrange.row': {
        const { ids } = payload as { ids: string[] };
        if (!sameParent(props.doc, ids)) break;
        dispatchAction(buildArrangeAsRowActions(props.doc, ids), 'Arrange as Row');
        break;
      }
      case 'overlap.remove': {
        const { parent } = payload as { parent?: string };
        dispatchAction(buildRemoveOverlapActions(props.doc, parent), 'Remove Overlap');
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
          edgeEmphasisNodeIds={(ids) => selectionSubtreeIds(props.doc, ids)}
          freezeEdgeRouting={edgeRoutingFrozen}
          chrome={buildChrome(history)}
          nodeContextMenu={(nodeId) => nodeContextMenu(menuDeps, nodeId)}
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
            data={() => props.data}
            editingId={editingId}
            onEnterEdit={setEditingId}
            onCommit={commitEdit}
            onCancel={() => setEditingId(null)}
            onModeChange={changeMode}
            onDragStart={beginDrag}
            onDragEnd={endDrag}
            dragGroup={dragGroup}
            ctrlHeld={ctrlHeld}
            onPressStart={beginCtrlTracking}
            effectiveColor={effectiveColor}
            previewContentSize={previewContentSize}
            onResizePreview={(nodeId, size) =>
              setPreviewContentSize(size === undefined ? undefined : { nodeId, ...size })
            }
            onResizeCommit={resizeContent}
            onFitContent={fitNodeToContent}
            onEdgePreviewChange={props.onEdgePreviewChange}
            connectValid={(source, target) => canConnect(props.doc, source, target)}
            dropAddsEdge={(source, parentId) => connectDropAddsEdge(props.doc, source, parentId)}
            onPortPreview={(nodeId, ports) => setPreviewPorts({ nodeId, ports })}
            onPortCommit={commitPorts}
            onPortCancel={() => setPreviewPorts(undefined)}
            portUsed={(nodeId, kind) => usedPorts().has(`${nodeId}:${kind}`)}
            previewPorts={previewPorts}
          />
        </Canvas>
        <LegendOverlay
          legend={() => props.doc.legend}
          onSave={(legend) => dispatchAction([{ type: 'setLegend', legend }], 'Edit Legend')}
        />
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
