import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import type { MerinoAction, MerinoColorToken, MerinoDocument, MerinoPortPosition, MerinoPorts, MerinoTab } from '@luminous/core/merino';
import { MERINO_TABS, applyMerinoBatch, descendantIds } from '@luminous/core/merino';
import { BoundaryHandle, Canvas, ConnectionPreview, NodeContainer, ResizeHandle, useCanvasContext, useGesture } from '@luminous/cactus';
import type { CanvasRef } from '@luminous/cactus';
import { CONTAINER_PADDING, DEFAULT_ENTRY_PORT, DEFAULT_EXIT_PORT, LIST_GAP, NODE_HEADER_HEIGHT, NODE_HEIGHT, NODE_WIDTH, childAreaOrigin, findContainerAtPoint, growOnlyContainerActions, listInsertionIndex, merinoPortDimensions, nodeHeight, nodeTypeById, projectMerino, tokenVar, type MerinoRenderNode } from './projection.ts';
import { nodeContextMenu, backgroundContextMenu, edgeContextMenu, type MerinoMenuDeps } from './menus.tsx';
import { ManageTypesPanel } from './ManageTypesPanel.tsx';
import { copyMerinoSelection, pasteMerinoSelection, type MerinoClipboard } from './clipboard.ts';
import { buildFlowLayoutActions, buildRemoveOverlapActions } from './tidy.ts';
import { transientViewportOptions } from '../../canvas-tools/transientViewport.ts';

const EDGE_TAB_SIZE = 18;
function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

/** Clear a focused details editor before a canvas gesture reads focus state.
 * The document listener that calls this runs in capture phase, ahead of cactus's
 * pointer handlers, so a click-away cannot leave the editor focused for a drag
 * or camera update. */
export function blurFocusedDetailsEditor(target: EventTarget | null): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement) || active.dataset.merinoDetailsEditor !== 'true') return;
  if (target instanceof Element && target.closest('[data-merino-details-editor]')) return;
  active.blur();
}

const TAB_LABELS: Record<MerinoTab, string> = { requirements: 'Requirements', deployments: 'Deployments' };

export interface MerinoCanvasProps {
  doc: MerinoDocument;
  /** Stable identity used only to retain the transient browser viewport. */
  sourceId: string;
  dispatchDoc: (next: MerinoDocument) => void;
  onRefused?: (message: string) => void;
  /** A non-expiring message describing the in-progress gesture — an Edge being
   * drawn, or a Node being dragged into or out of a Container. */
  onEdgePreviewChange?: (message: string | null) => void;
}

/** Mint an id not already used by any Node, Edge, or Type. */
function uniqueId(doc: MerinoDocument, prefix: string): string {
  const taken = new Set<string>([
    ...doc.nodes.map(n => n.id),
    ...doc.edges.map(e => e.id),
    ...doc.nodeTypes.map(t => t.id),
    ...doc.edgeTypes.map(t => t.id),
  ]);
  let i = 1;
  while (taken.has(`${prefix}-${i}`)) i += 1;
  return `${prefix}-${i}`;
}

const NEW_TYPE_COLORS: MerinoColorToken[] = ['accent-1', 'accent-2', 'accent-3', 'accent-4', 'accent-5', 'accent-6', 'accent-7', 'accent-8'];

export function MerinoCanvas(props: MerinoCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  const [tab, setTab] = createSignal<MerinoTab>('requirements');
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [managing, setManaging] = createSignal(false);
  let clipboard: MerinoClipboard | undefined;
  let pasteCount = 0;

  // Most-recently-used Node Types, newest first — session state, seeded from
  // the Types the open document's Nodes already use (newest Node first).
  function seedRecentTypes(): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const n of [...props.doc.nodes].reverse()) {
      if (!seen.has(n.type)) { seen.add(n.type); ids.push(n.type); }
    }
    return ids;
  }
  const [recentTypeIds, setRecentTypeIds] = createSignal<string[]>(seedRecentTypes());
  function touchType(typeId: string) {
    setRecentTypeIds((prev) => [typeId, ...prev.filter((t) => t !== typeId)]);
  }

  // A boundary Port being dragged: applied to the render doc so the Edges
  // routing through it re-thread live, before the move is committed.
  const [previewPorts, setPreviewPorts] = createSignal<{ nodeId: string; ports: MerinoPorts } | undefined>();
  const docForRender = createMemo(() => {
    const preview = previewPorts();
    if (!preview) return props.doc;
    return { ...props.doc, nodes: props.doc.nodes.map((n) => n.id === preview.nodeId ? { ...n, ports: preview.ports } : n) };
  });

  const projection = createMemo(() => projectMerino(docForRender(), tab()));
  const renderNodes = createMemo(() => projection().nodes);
  const edges = createMemo(() => projection().edges);
  const typesById = createMemo(() => nodeTypeById(props.doc));

  // Which Container Ports an Edge actually threads through — those draw at full
  // opacity, the rest sit faint until hovered. Mirrors the router's crossing
  // decision: a Container's `exit` is used on the source side of the lowest
  // common ancestor, its `entry` on the destination side.
  const usedPorts = createMemo(() => {
    const typeMap = typesById();
    const byId = new Map(props.doc.nodes.map((n) => [n.id, n]));
    const containerParent = (id: string): string | undefined => {
      const n = byId.get(id);
      if (!n || n.parent === undefined) return undefined;
      const parent = byId.get(n.parent);
      return parent && typeMap.get(parent.type)?.layout !== undefined ? n.parent : undefined;
    };
    const ancestors = (id: string): string[] => {
      const out: string[] = [];
      const node = byId.get(id);
      let current = node && typeMap.get(node.type)?.layout !== undefined ? id : containerParent(id);
      while (current !== undefined) { out.push(current); current = containerParent(current); }
      return out;
    };
    const used = new Set<string>();
    for (const edge of props.doc.edges) {
      const source = ancestors(edge.from);
      const target = ancestors(edge.to);
      const common = source.find((id) => target.includes(id));
      for (const id of common ? source.slice(0, source.indexOf(common)) : source) used.add(`${id}:exit`);
      for (const id of common ? target.slice(0, target.indexOf(common)) : target) used.add(`${id}:entry`);
    }
    return used;
  });

  function commitPorts(nodeId: string, ports: MerinoPorts): void {
    setPreviewPorts(undefined);
    dispatchAction([{ type: 'setNode', id: nodeId, ports }]);
  }

  const menuDeps: MerinoMenuDeps = { doc: () => props.doc, recentTypeIds };

  function dispatchAction(actions: MerinoAction[]): void {
    if (actions.length === 0) return;
    const result = applyMerinoBatch(props.doc, actions);
    if (!result.ok) {
      props.onRefused?.(result.error);
      return;
    }
    const sizeTouchedIds = new Set(actions.flatMap((action) =>
      action.type === 'setNode' && ('width' in action || 'height' in action) ? [action.id] : [],
    ));
    const growOnly = growOnlyContainerActions(props.doc, result.doc, sizeTouchedIds);
    if (growOnly.length === 0) {
      props.dispatchDoc(result.doc);
      return;
    }
    const grown = applyMerinoBatch(result.doc, growOnly);
    if (!grown.ok) {
      props.onRefused?.(grown.error);
      return;
    }
    props.dispatchDoc(grown.doc);
  }

  function firstNodeType(): string | undefined {
    return props.doc.nodeTypes[0]?.id;
  }

  function firstEdgeType(): string | undefined {
    return props.doc.edgeTypes[0]?.id;
  }

  // Persist a dragged Node's new position in its own frame: relative to its
  // Container's child area when contained, absolute otherwise. The Container's
  // child-area origin moves with it, so a child dragged alongside its Container
  // keeps the same relative slot and follows for free.
  function repositionAction(id: string, dx: number, dy: number, rnById: Map<string, MerinoRenderNode>): MerinoAction[] {
    const rn = rnById.get(id);
    if (!rn) return [];
    if (rn.contained && rn.node.parent !== undefined) {
      const parent = rnById.get(rn.node.parent);
      if (parent) {
        const originX = parent.x + CONTAINER_PADDING;
        const origin = childAreaOrigin(parent.node);
        const originY = parent.y + origin.y;
        return [{ type: 'setNode', id, x: rn.x + dx - originX, y: rn.y + dy - originY }];
      }
    }
    return [{ type: 'setNode', id, x: rn.x + dx, y: rn.y + dy }];
  }

  // Renumber a `list` Container's children so the dragged Node lands in the slot
  // its drop-center falls into. Emits a full 0-based renumber (only for children
  // whose order actually shifts), plus the dragged Node's parent/order and the
  // clearing of its x/y — a list child is placed by order, not coordinates.
  function listReorderActions(targetId: string, draggedId: string, centerY: number, rns: MerinoRenderNode[]): MerinoAction[] {
    const index = listInsertionIndex(rns, targetId, draggedId, centerY);
    const siblings = rns
      .filter((r) => r.contained && r.node.parent === targetId && r.node.id !== draggedId)
      .sort((a, b) => a.y - b.y)
      .map((r) => r.node.id);
    const ordered = [...siblings.slice(0, index), draggedId, ...siblings.slice(index)];
    const orderById = new Map(rns.map((r) => [r.node.id, r.node.order]));
    const actions: MerinoAction[] = [];
    ordered.forEach((nid, i) => {
      if (nid === draggedId) {
        actions.push({ type: 'setNode', id: nid, parent: targetId, order: i, x: undefined, y: undefined });
      } else if (orderById.get(nid) !== i) {
        actions.push({ type: 'setNode', id: nid, order: i });
      }
    });
    return actions;
  }

  function endDrag(nodeIds: ReadonlyArray<string>, dx: number, dy: number) {
    const rnById = new Map(renderNodes().map((r) => [r.node.id, r]));

    // A multi-Node drag never changes Container membership (N12 is single-Node);
    // each selected root moves in its own frame. A selected child of a selected
    // Container already follows that Container live, so writing it as well
    // would apply the same delta a second time after release.
    if (nodeIds.length !== 1) {
      const selected = new Set(nodeIds);
      const roots = nodeIds.filter((id) => {
        let current = rnById.get(id);
        while (current?.contained && current.node.parent !== undefined) {
          if (selected.has(current.node.parent)) return false;
          current = rnById.get(current.node.parent);
        }
        return true;
      });
      dispatchAction(roots.flatMap((id) => repositionAction(id, dx, dy, rnById)));
      return;
    }

    const id = nodeIds[0];
    const rn = rnById.get(id);
    if (!rn) return;
    const tethered = rn.node.parent !== undefined && !rn.contained;
    // A tethered Subnode keeps its dotted parent; dragging only moves it.
    if (tethered) {
      dispatchAction([{ type: 'setNode', id, x: rn.x + dx, y: rn.y + dy }]);
      return;
    }

    const newX = rn.x + dx;
    const newY = rn.y + dy;
    const exclude = new Set(descendantIds(props.doc, id));
    const target = findContainerAtPoint(renderNodes(), newX + rn.w / 2, newY + rn.h / 2, exclude);
    const currentParent = rn.contained ? rn.node.parent ?? null : null;
    const targetRn = target !== null ? rnById.get(target) : undefined;

    // Dropping into a `list` Container (whether it is the current parent or a new
    // one) is an ordered insert, not a free placement.
    if (targetRn?.isList) {
      dispatchAction(listReorderActions(target!, id, newY + rn.h / 2, renderNodes()));
      return;
    }
    if (target === currentParent) {
      dispatchAction(repositionAction(id, dx, dy, rnById));
      return;
    }
    if (targetRn) {
      const origin = childAreaOrigin(targetRn.node);
      dispatchAction([{ type: 'setNode', id, parent: target!, x: newX - (targetRn.x + origin.x), y: newY - (targetRn.y + origin.y) }]);
    } else {
      dispatchAction([{ type: 'setNode', id, parent: null, x: newX, y: newY }]);
    }
  }

  function onConnect(c: { source: string; target: string }) {
    const edgeType = firstEdgeType();
    if (edgeType === undefined) {
      props.onRefused?.('Add an edge type first (Manage types…)');
      return;
    }
    dispatchAction([{ type: 'connect', id: uniqueId(props.doc, 'e'), edgeType, from: c.source, to: c.target }]);
  }

  function canConnect(source: string, target: string): boolean {
    if (source === target) return false;
    const from = props.doc.nodes.find(n => n.id === source);
    const to = props.doc.nodes.find(n => n.id === target);
    return from !== undefined && to !== undefined && from.tab === to.tab;
  }

  // Ctrl/Meta completes an in-progress Edge into a fresh peer Node. Cactus
  // owns the modifier gesture; Merino supplies its meaning and persistence.
  function onConnectDrop(info: { source: string; clientX: number; clientY: number }) {
    const source = props.doc.nodes.find((node) => node.id === info.source);
    const edgeType = firstEdgeType();
    if (!source || !edgeType || !canvasRef) return;
    const id = uniqueId(props.doc, 'n');
    const point = canvasRef.screenToCanvas(info.clientX, info.clientY);
    dispatchAction([
      { type: 'addNode', id, tab: source.tab, nodeType: source.type, name: 'New node', x: point.x, y: point.y },
      { type: 'connect', id: uniqueId(props.doc, 'e'), edgeType, from: source.id, to: id },
    ]);
    touchType(source.type);
    canvasRef.setSelectedIds([id]);
    setSelectedId(id);
  }

  function copySelection() {
    const next = copyMerinoSelection(props.doc, canvasRef?.getSelectedIds() ?? [], renderNodes());
    if (!next) return;
    clipboard = next;
    pasteCount = 0;
  }

  function pasteSelection(position?: { x: number; y: number }) {
    if (!clipboard) return;
    const minX = Math.min(...clipboard.nodes.map((node) => node.x ?? 40));
    const minY = Math.min(...clipboard.nodes.map((node) => node.y ?? 40));
    pasteCount += 1;
    const offset = position
      ? { x: position.x - minX, y: position.y - minY }
      : { x: 32 * pasteCount, y: 32 * pasteCount };
    const pasted = pasteMerinoSelection(props.doc, clipboard, tab(), offset);
    dispatchAction(pasted.actions);
    for (const node of clipboard.nodes) touchType(node.type);
    canvasRef?.setSelectedIds(pasted.nodeIds);
    setSelectedId(pasted.nodeIds[0] ?? null);
  }

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isEditableTarget(e.target)) return;
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
      } else if (e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  function addNodeAt(parent?: string, requestedType?: string, position?: { x: number; y: number }) {
    const nodeType = requestedType ?? firstNodeType();
    if (nodeType === undefined) {
      props.onRefused?.('Add a node type first (Manage types…)');
      return;
    }
    const id = uniqueId(props.doc, 'n');
    // A child of a Container carries no absolute coordinates — the projection
    // places it (freely stacked, or appended to a list). Inside a `list`, it also
    // takes the next `order`. Everything else is placed in absolute coordinates.
    const parentLayout = parent !== undefined
      ? typesById().get(props.doc.nodes.find(n => n.id === parent)?.type ?? '')?.layout
      : undefined;
    let coords: { x: number; y: number } | undefined;
    let order: number | undefined;
    if (parentLayout !== undefined) {
      coords = undefined;
      if (parentLayout === 'list') order = props.doc.nodes.filter(n => n.parent === parent).length;
    } else if (parent !== undefined) {
      const prn = renderNodes().find(n => n.node.id === parent);
      coords = prn ? { x: prn.x + 40, y: prn.y + NODE_HEIGHT + 48 } : { x: 40, y: 40 };
    } else if (position !== undefined) {
      coords = position;
    } else {
      const count = renderNodes().length;
      coords = { x: 40 + (count % 4) * (NODE_WIDTH + 48), y: 40 + Math.floor(count / 4) * (NODE_HEIGHT + 48) };
    }
    dispatchAction([{ type: 'addNode', id, tab: tab(), nodeType, name: 'New node', parent, order, x: coords?.x, y: coords?.y }]);
    touchType(nodeType);
    // `selectedId` only tracks Merino's command target; cactus owns the
    // rendered selection. Select the new Node there too, replacing any prior
    // selection so follow-up actions address the Node just created.
    canvasRef?.setSelectedIds([id]);
    setSelectedId(id);
  }

  function newNodeTypeApplied(nodeId: string) {
    const id = uniqueId(props.doc, 'type');
    const color = NEW_TYPE_COLORS[props.doc.nodeTypes.length % NEW_TYPE_COLORS.length];
    dispatchAction([
      { type: 'addNodeType', id, name: 'New type', color },
      { type: 'setNode', id: nodeId, nodeType: id },
    ]);
    touchType(id);
  }

  function newEdgeTypeApplied(edgeId: string) {
    const id = uniqueId(props.doc, 'etype');
    const color = NEW_TYPE_COLORS[props.doc.edgeTypes.length % NEW_TYPE_COLORS.length];
    dispatchAction([
      { type: 'addEdgeType', id, name: 'New type', color, dash: 'solid', arrowHead: true, directed: true },
      { type: 'setEdge', id: edgeId, edgeType: id },
    ]);
  }

  function onAction(id: string, payload?: unknown) {
    const p = (payload ?? {}) as Record<string, unknown>;
    switch (id) {
      case 'view.fit': fitAll(); break;
      case 'selection.copy': copySelection(); break;
      case 'selection.paste': pasteSelection(
        typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : undefined,
      ); break;
      case 'node.add': addNodeAt(
        undefined,
        typeof p.nodeType === 'string' ? p.nodeType : undefined,
        typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : undefined,
      ); break;
      case 'node.addSubnode': addNodeAt(typeof p.parent === 'string' ? p.parent : undefined); break;
      case 'node.setType': {
        if (typeof p.id !== 'string' || typeof p.typeId !== 'string') break;
        dispatchAction([{ type: 'setNode', id: p.id, nodeType: p.typeId }]);
        touchType(p.typeId);
        break;
      }
      case 'node.newType': if (typeof p.id === 'string') newNodeTypeApplied(p.id); break;
      case 'node.delete':
        if (typeof p.id !== 'string') break;
        if (selectedId() === p.id) setSelectedId(null);
        dispatchAction([{ type: 'removeNode', id: p.id }]);
        break;
      case 'edge.setType':
        if (typeof p.id === 'string' && typeof p.typeId === 'string') {
          dispatchAction([{ type: 'setEdge', id: p.id, edgeType: p.typeId }]);
        }
        break;
      case 'edge.newType': if (typeof p.id === 'string') newEdgeTypeApplied(p.id); break;
      case 'edge.delete': if (typeof p.id === 'string') dispatchAction([{ type: 'disconnect', id: p.id }]); break;
      case 'types.manage': setManaging(true); break;
    }
  }

  function fitAll() {
    const list = renderNodes();
    if (!canvasRef || list.length === 0) return;
    canvasRef.fitView(list.map(n => ({ x: n.x, y: n.y, width: n.w, height: n.h })), 64);
  }

  function tidyContainer(id: string) {
    dispatchAction(buildRemoveOverlapActions(props.doc, id));
  }

  function flowContainer(id: string) {
    dispatchAction(buildFlowLayoutActions(props.doc, id));
  }

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0, display: 'flex', 'flex-direction': 'column' }}>
      <div class="flex items-center gap-1 border-b border-border bg-surface px-3 py-1">
        <For each={MERINO_TABS}>
          {(t) => (
            <button
              class={`rounded px-3 py-1 text-sm ${tab() === t ? 'bg-accent text-on-accent' : 'text-fg-muted hover:bg-surface-alt hover:text-fg'}`}
              onClick={() => { setTab(t); canvasRef?.clearSelection(); setSelectedId(null); }}
            >
              {TAB_LABELS[t]}
            </button>
          )}
        </For>
        <button
          class="ml-auto rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-fg"
          onClick={() => setManaging(true)}
        >
          Manage types…
        </button>
      </div>

      <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
        <Canvas
          ref={(r) => { canvasRef = r; }}
          viewportOptions={transientViewportOptions(`luminous:merino:viewport:${props.sourceId}`)}
          edges={edges()}
          edgeEmphasis={{ dimUnselected: false, selectedWidthMultiplier: 2 }}
          boxSelect={{
            trigger: 'drag',
          }}
          onSelectionChange={(ids) => setSelectedId(ids.length > 0 ? ids[0] : null)}
          onAction={onAction}
          nodeContextMenu={(nodeId) => nodeContextMenu(menuDeps, nodeId)}
          backgroundContextMenu={(position) => backgroundContextMenu(menuDeps, position)}
          edgeContextMenu={(edgeId) => edgeContextMenu(menuDeps, edgeId)}
          connectionDrag={{
            onConnect,
            onConnectDrop,
            isValidConnection: (c) => canConnect(c.source, c.target),
          }}
          renderConnectionPreview={(coords) => (
            <ConnectionPreview
              d={`M ${coords.startX} ${coords.startY} L ${coords.currentX} ${coords.currentY}`}
              stroke="var(--accent)"
            />
          )}
        >
          <MerinoNodeLayer
            nodes={renderNodes}
            typeColor={(typeId) => { const t = typesById().get(typeId); return t ? tokenVar(t.color) : 'var(--border)'; }}
            typeName={(typeId) => typesById().get(typeId)?.name ?? typeId}
            onDragEnd={endDrag}
            onToggleExpand={(nodeId, expanded) => dispatchAction([{ type: 'setNode', id: nodeId, expanded }])}
            onTidy={tidyContainer}
            onFlow={flowContainer}
            onRename={(nodeId, name) => dispatchAction([{ type: 'setNode', id: nodeId, name }])}
            onSetText={(nodeId, text) => dispatchAction([{ type: 'setNode', id: nodeId, text }])}
            onResize={(nodeId, size) => dispatchAction([{ type: 'setNode', id: nodeId, ...size }])}
            onEdgePreviewChange={props.onEdgePreviewChange}
            onPortPreview={(nodeId, ports) => setPreviewPorts({ nodeId, ports })}
            onPortCommit={commitPorts}
            onPortCancel={() => setPreviewPorts(undefined)}
            portUsed={(nodeId, kind) => usedPorts().has(`${nodeId}:${kind}`)}
            previewPorts={previewPorts}
          />
        </Canvas>

        <Show when={managing()}>
          <ManageTypesPanel
            doc={() => props.doc}
            onSetNodeType={(id, patch) => dispatchAction([{ type: 'setNodeType', id, ...patch }])}
            onRemoveNodeType={(id) => dispatchAction([{ type: 'removeNodeType', id }])}
            onAddNodeType={() => dispatchAction([{ type: 'addNodeType', id: uniqueId(props.doc, 'type'), name: 'New type', color: NEW_TYPE_COLORS[props.doc.nodeTypes.length % NEW_TYPE_COLORS.length] }])}
            onSetEdgeType={(id, patch) => dispatchAction([{ type: 'setEdgeType', id, ...patch }])}
            onRemoveEdgeType={(id) => dispatchAction([{ type: 'removeEdgeType', id }])}
            onAddEdgeType={() => dispatchAction([{ type: 'addEdgeType', id: uniqueId(props.doc, 'etype'), name: 'New type', color: NEW_TYPE_COLORS[props.doc.edgeTypes.length % NEW_TYPE_COLORS.length], dash: 'solid', arrowHead: true, directed: true }])}
            onClose={() => setManaging(false)}
          />
        </Show>
      </div>
    </div>
  );
}

interface MerinoNodeLayerProps {
  nodes: () => MerinoRenderNode[];
  typeColor: (typeId: string) => string;
  typeName: (typeId: string) => string;
  onDragEnd: (nodeIds: ReadonlyArray<string>, dx: number, dy: number) => void;
  onToggleExpand: (nodeId: string, expanded: boolean) => void;
  onTidy: (nodeId: string) => void;
  onFlow: (nodeId: string) => void;
  onRename: (nodeId: string, name: string) => void;
  onSetText: (nodeId: string, text: string) => void;
  onResize: (nodeId: string, size: { width: number; height: number }) => void;
  onEdgePreviewChange?: (message: string | null) => void;
  onPortPreview: (nodeId: string, ports: MerinoPorts) => void;
  onPortCommit: (nodeId: string, ports: MerinoPorts) => void;
  onPortCancel: () => void;
  portUsed: (nodeId: string, kind: 'entry' | 'exit') => boolean;
  previewPorts: () => { nodeId: string; ports: MerinoPorts } | undefined;
}

/** Rendered inside <Canvas> so useCanvasContext resolves (same constraint as
 * Linen's and Atlas's node layers). */
function MerinoNodeLayer(props: MerinoNodeLayerProps): JSX.Element {
  const ctx = useCanvasContext();
  const [resizePreview, setResizePreview] = createSignal<{ nodeId: string; width: number; height: number } | undefined>();
  onMount(() => {
    const onDocumentPointerDown = (event: PointerEvent) => blurFocusedDetailsEditor(event.target);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));
  });
  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    // Cactus owns the generic selection-group gesture; Merino owns only
    // persisting the resulting position changes.
    dragGroup: (nodeId) => {
      const selected = ctx.selectedIds();
      return selected.includes(nodeId) ? selected : [nodeId];
    },
    callbacks: {
      onDragEnd: (_nodeId, dx, dy, nodeIds) => props.onDragEnd(nodeIds, dx, dy),
      onResize: (nodeId, deltaWidth, deltaHeight) => {
        const node = props.nodes().find((rn) => rn.node.id === nodeId);
        if (!node) return;
        setResizePreview({
          nodeId,
          width: Math.max(node.minW ?? node.w, node.w + deltaWidth),
          height: Math.max(node.minH ?? node.h, node.h + deltaHeight),
        });
      },
      onResizeEnd: (nodeId) => {
        const preview = resizePreview();
        setResizePreview(undefined);
        if (preview?.nodeId === nodeId) props.onResize(nodeId, preview);
      },
    },
  });
  // Container membership among the rendered Nodes — a contained Node's parent
  // is a Container. Used so a child follows its Container's live drag delta.
  const containerParentOf = createMemo(() => {
    const m = new Map<string, string>();
    for (const rn of props.nodes()) if (rn.contained && rn.node.parent) m.set(rn.node.id, rn.node.parent);
    return m;
  });
  // A Node follows the drag if it is dragged directly, or any Container ancestor
  // of it is — moving a Container moves everything inside it.
  const isFollowing = (id: string): boolean => {
    const dragged = new Set(gesture.draggedNodeIds());
    const cpo = containerParentOf();
    let current: string | undefined = id;
    while (current !== undefined) {
      if (dragged.has(current)) return true;
      current = cpo.get(current);
    }
    return false;
  };
  const dragDelta = (id: string) => {
    const g = gesture.gesture();
    if (g.kind !== 'draggingNode' || !isFollowing(id)) return { dx: 0, dy: 0 };
    return gesture.dragDelta();
  };

  const containerChildrenOf = createMemo(() => {
    const m = new Map<string, string[]>();
    for (const rn of props.nodes()) {
      if (!rn.contained || !rn.node.parent) continue;
      const list = m.get(rn.node.parent) ?? [];
      list.push(rn.node.id);
      m.set(rn.node.parent, list);
    }
    return m;
  });
  // A Node plus its whole containment subtree — the Containers a drop may not
  // file it into (you can't file a Node inside its own child).
  const descendantSet = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    const children = containerChildrenOf();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const child of children.get(current) ?? []) {
        if (!out.has(child)) { out.add(child); stack.push(child); }
      }
    }
    return out;
  };

  // The sentence describing what releasing the current Node drag would do —
  // file into a Container, detach to the top level, or just move (mirrors the
  // reparent decision in MerinoCanvas.endDrag). Null when nothing is dragging.
  const describeNodeDrag = (): string | null => {
    const dragged = gesture.draggedNodeIds();
    if (dragged.length === 0) return null;
    const nodes = props.nodes();
    const nameOf = (id: string) => nodes.find((n) => n.node.id === id)?.node.name ?? id;
    if (dragged.length > 1) return `Moving ${dragged.length} nodes`;
    const id = dragged[0];
    const rn = nodes.find((n) => n.node.id === id);
    if (!rn) return null;
    // A tethered Subnode keeps its dotted parent; dragging only repositions it.
    if (rn.node.parent !== undefined && !rn.contained) return `Moving "${nameOf(id)}"`;
    const { dx, dy } = gesture.dragDelta();
    const centerY = rn.y + dy + rn.h / 2;
    const target = findContainerAtPoint(nodes, rn.x + dx + rn.w / 2, centerY, descendantSet(id));
    const currentParent = rn.contained ? rn.node.parent ?? null : null;
    const targetRn = target !== null ? nodes.find((n) => n.node.id === target) : undefined;
    if (targetRn?.isList) {
      const position = listInsertionIndex(nodes, target!, id, centerY) + 1;
      return target === currentParent
        ? `Moving "${nameOf(id)}" to position ${position} in "${nameOf(target!)}"`
        : `Filing "${nameOf(id)}" into "${nameOf(target!)}" at position ${position}`;
    }
    if (target === currentParent) {
      return currentParent ? `Moving "${nameOf(id)}" within "${nameOf(currentParent)}"` : `Moving "${nameOf(id)}"`;
    }
    if (target !== null) return `Filing "${nameOf(id)}" into "${nameOf(target)}"`;
    return `Detaching "${nameOf(id)}" to the top level`;
  };

  // While a single Node is dragged over a `list` Container, its children below
  // the hovered slot slide down to open a gap — the live preview of the ordered
  // insert the drop will commit.
  const liveList = createMemo(() => {
    const g = gesture.gesture();
    if (g.kind !== 'draggingNode') return null;
    const dragged = gesture.draggedNodeIds();
    if (dragged.length !== 1) return null;
    const id = dragged[0];
    const nodes = props.nodes();
    const rn = nodes.find((n) => n.node.id === id);
    if (!rn) return null;
    const { dx, dy } = gesture.dragDelta();
    const centerY = rn.y + dy + rn.h / 2;
    const target = findContainerAtPoint(nodes, rn.x + dx + rn.w / 2, centerY, descendantSet(id));
    if (target === null) return null;
    const targetRn = nodes.find((n) => n.node.id === target);
    if (!targetRn?.isList) return null;
    return { target, draggedId: id, index: listInsertionIndex(nodes, target, id, centerY), shift: rn.h + LIST_GAP };
  });
  // The gap-opening offset for one list child during a live drag: children at or
  // after the hovered slot shift down by the dragged Node's footprint.
  const listShift = (rn: MerinoRenderNode): number => {
    const ll = liveList();
    if (!ll || !rn.contained || rn.node.parent !== ll.target || rn.node.id === ll.draggedId) return 0;
    const pos = props.nodes()
      .filter((n) => n.contained && n.node.parent === ll.target && n.node.id !== ll.draggedId)
      .sort((a, b) => a.y - b.y)
      .findIndex((n) => n.node.id === rn.node.id);
    return pos >= ll.index ? ll.shift : 0;
  };

  // The gesture state belongs to cactus; this layer translates it into the
  // actor-aware sentence Merino shows in its reserved toast slot — an Edge
  // gesture's outcome, or (when none) a Node drag's Container outcome.
  createEffect(() => {
    const drag = ctx.connectionDrag();
    if (drag) {
      const source = props.nodes().find((node) => node.node.id === drag.sourceNodeId)?.node;
      const sourceName = source?.name ?? drag.sourceNodeId;
      if (ctx.ctrlHeld()) {
        const typeName = source ? props.typeName(source.type) : 'same-type';
        props.onEdgePreviewChange?.(`Creating new ${typeName} node with edge from "${sourceName}"`);
        return;
      }
      const targetId = document
        .elementsFromPoint(drag.currentScreenX, drag.currentScreenY)
        .find((el) => el.hasAttribute('data-connection-target'))
        ?.getAttribute('data-node-id') ?? null;
      const targetName = targetId === null ? null : props.nodes().find((node) => node.node.id === targetId)?.node.name ?? targetId;
      const base = targetName ? `Creating new edge from "${sourceName}" to "${targetName}"` : `Creating new edge from "${sourceName}"`;
      props.onEdgePreviewChange?.(`${base} (hint: hold ctrl to add a new node)`);
      return;
    }
    props.onEdgePreviewChange?.(describeNodeDrag());
  });
  onCleanup(() => props.onEdgePreviewChange?.(null));

  return (
    <For each={props.nodes()}>
      {(rn) => {
        const id = rn.node.id;
        // The connect indicator holds on hover via subtree enter/leave: it stays
        // mounted (opacity toggled, not <Show>) so the pointer can travel from
        // the node onto it — a sibling inside the same wrapper — without a
        // pointerleave firing in the gap. It also stays lit while this node is
        // the active edge source. (Mirrors Atlas's Edge Tab, R45.)
        const [hovered, setHovered] = createSignal(false);
        const [editingName, setEditingName] = createSignal(false);
        const isEdgeSource = () => ctx.connectionDrag()?.sourceNodeId === id;
        const tabVisible = () => hovered() || isEdgeSource();
        const delta = () => dragDelta(id);
        const size = () => {
          const preview = resizePreview();
          return preview?.nodeId === id ? preview : { width: rn.w, height: rn.h };
        };
        const offsetY = () => delta().dy + listShift(rn);
        const color = () => props.typeColor(rn.node.type);
        const stopDrag = (e: PointerEvent) => e.stopPropagation();
        // Boundary Ports — each Container's shared crossing point for every Edge
        // that leaves (`exit`) or enters (`entry`) its box, draggable around the border.
        const [hoveredPort, setHoveredPort] = createSignal<'entry' | 'exit' | null>(null);
        const [draggedPort, setDraggedPort] = createSignal<'entry' | 'exit' | null>(null);
        const portRect = () => ({ x: rn.x + delta().dx, y: rn.y + offsetY(), w: size().width, h: size().height });
        const portPosition = (kind: 'entry' | 'exit'): MerinoPortPosition => {
          const preview = props.previewPorts();
          return (preview?.nodeId === id ? preview.ports[kind] : rn.node.ports?.[kind])
            ?? (kind === 'entry' ? DEFAULT_ENTRY_PORT : DEFAULT_EXIT_PORT);
        };
        const updatePort = (kind: 'entry' | 'exit', position: MerinoPortPosition, commit: boolean) => {
          const preview = props.previewPorts();
          const base = preview?.nodeId === id ? preview.ports : rn.node.ports;
          const ports = { ...base, [kind]: position };
          if (commit) { setDraggedPort(null); props.onPortCommit(id, ports); }
          else { setDraggedPort(kind); props.onPortPreview(id, ports); }
        };
        const portOpacity = (kind: 'entry' | 'exit') => props.portUsed(id, kind) || hoveredPort() === kind || draggedPort() === kind ? 1 : 0.35;
        const glyphRotation = (kind: 'entry' | 'exit') => {
          const inward = { top: 90, right: 180, bottom: -90, left: 0 }[portPosition(kind).side];
          return inward + (kind === 'exit' ? 180 : 0);
        };
        return (
          <div onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <NodeContainer
              nodeId={id}
              x={() => rn.x + delta().dx}
              y={() => rn.y + offsetY()}
              w={() => size().width}
              h={() => size().height}
              visualBand={() => 2 * rn.depth}
              onPointerDown={(e) => { ctx.onNodePointerDown(id, e); gesture.beginPress(id, e); }}
            >
              <div
                style={{
                  display: 'flex',
                  'flex-direction': 'column',
                  height: '100%',
                  background: 'var(--surface)',
                  border: ctx.isSelected(id) ? '3px solid var(--accent)' : '1px solid var(--border)',
                  'border-radius': '6px',
                  color: 'var(--fg)',
                  cursor: 'grab',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', height: `${NODE_HEADER_HEIGHT}px`, 'flex-shrink': '0', padding: '0 4px 0 10px' }}>
                  <div style={{ display: 'flex', 'flex-direction': 'column', 'justify-content': 'center', gap: '2px', 'min-width': '0', flex: '1 1 auto' }}>
                    <Show
                      when={editingName()}
                      fallback={
                        <span
                          style={{ 'font-size': '12px', 'font-weight': '600', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}
                          on:dblclick={(e) => { e.stopPropagation(); setEditingName(true); }}
                        >
                          {rn.node.name}
                        </span>
                      }
                    >
                      <input
                        data-no-pan="true"
                        style={{ 'font-size': '12px', 'font-weight': '600', width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)' }}
                        value={rn.node.name}
                        ref={(el) => queueMicrotask(() => { el.focus(); el.select(); })}
                        on:pointerdown={stopDrag}
                        onBlur={(e) => { setEditingName(false); props.onRename(id, e.currentTarget.value); }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') { setEditingName(false); props.onRename(id, e.currentTarget.value); }
                          else if (e.key === 'Escape') setEditingName(false);
                        }}
                      />
                    </Show>
                    <span
                      style={{
                        'font-size': '10px',
                        'font-weight': '600',
                        'line-height': '1',
                        color: 'var(--type-badge-fg)',
                        background: color(),
                        padding: '2px 6px',
                        'border-radius': '9999px',
                        'white-space': 'nowrap',
                        width: 'fit-content',
                      }}
                    >
                      {props.typeName(rn.node.type)}
                    </span>
                  </div>
                  <button
                    data-no-pan="true"
                    title={rn.node.expanded ? 'Collapse detail' : 'Expand detail'}
                    style={{
                      'flex-shrink': '0',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      'align-items': 'center',
                      'justify-content': 'center',
                      'border-radius': '4px',
                      color: 'var(--fg-muted)',
                      'font-size': '11px',
                      cursor: 'pointer',
                    }}
                    on:pointerdown={stopDrag}
                    onClick={(e) => { e.stopPropagation(); props.onToggleExpand(id, !rn.node.expanded); }}
                  >
                    {rn.node.expanded ? '▾' : '▸'}
                  </button>
                </div>
                <Show
                  when={rn.node.expanded}
                  fallback={
                    <div
                      style={{
                        height: `${NODE_HEIGHT - NODE_HEADER_HEIGHT}px`,
                        'flex-shrink': '0',
                        padding: '0 10px 6px',
                        'font-size': '11px',
                        'font-style': rn.node.text ? 'normal' : 'italic',
                        color: rn.node.text ? 'var(--fg-muted)' : 'var(--fg-subtle)',
                        overflow: 'hidden',
                        'text-overflow': 'ellipsis',
                        'white-space': 'nowrap',
                      }}
                      on:dblclick={(e) => { e.stopPropagation(); props.onToggleExpand(id, true); }}
                    >
                      {rn.node.text ? rn.node.text.split('\n')[0] : 'No detail yet'}
                    </div>
                  }
                >
                  <div data-merino-details-editor style={{ height: `${nodeHeight(rn.node) - NODE_HEADER_HEIGHT}px`, 'flex-shrink': '0', padding: '0 8px 8px' }}>
                    <textarea
                      data-merino-details-editor="true"
                      data-no-pan="true"
                      class="h-full w-full resize-none rounded border border-border bg-canvas px-2 py-1 text-xs text-fg placeholder:italic"
                      style={{ cursor: 'text' }}
                      placeholder="Add Details"
                      value={rn.node.text ?? ''}
                      ref={(el) => queueMicrotask(() => el.focus())}
                      on:pointerdown={stopDrag}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Escape') e.currentTarget.blur();
                      }}
                      onChange={(e) => props.onSetText(id, e.currentTarget.value)}
                    />
                  </div>
                </Show>
                <Show when={rn.isContainer}>
                  <div
                    style={{
                      flex: '1 1 auto',
                      'min-height': '0',
                      margin: `${CONTAINER_PADDING}px`,
                      background: 'var(--color-merino-container-fill)',
                      'border-radius': '2px',
                    }}
                  >
                    <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', padding: '3px 6px' }}>
                      <span
                        style={{
                          'font-size': '9px',
                          'font-weight': '600',
                          'line-height': '10px',
                          color: 'var(--fg-muted)',
                          'text-align': 'left',
                        }}
                      >
                        {rn.isList ? 'List Container' : 'Freeform Container'}
                      </span>
                      <Show when={!rn.isList}>
                        {(() => {
                          const chipStyle = {
                            'flex-shrink': '0',
                            height: '16px',
                            padding: '0 6px',
                            display: 'flex',
                            'align-items': 'center',
                            gap: '3px',
                            'border-radius': '4px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--fg-muted)',
                            'font-size': '9px',
                            'font-weight': '600',
                            'line-height': '1',
                            cursor: 'pointer',
                          } as const;
                          return (
                            <>
                              <button
                                data-no-pan="true"
                                title="Tidy — push overlapping nodes apart"
                                style={chipStyle}
                                on:pointerdown={stopDrag}
                                onClick={(e) => { e.stopPropagation(); props.onTidy(id); }}
                              >
                                ⤡ Tidy
                              </button>
                              <button
                                data-no-pan="true"
                                title="Flow — stack children into rows so directed edges flow downward"
                                style={chipStyle}
                                on:pointerdown={stopDrag}
                                onClick={(e) => { e.stopPropagation(); props.onFlow(id); }}
                              >
                                ↓ Flow
                              </button>
                            </>
                          );
                        })()}
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
              <Show when={rn.isContainer}>
                <ResizeHandle
                  nodeId={id}
                  onResizePointerDown={(nodeId, direction, event) => gesture.beginResize(nodeId, direction, event)}
                />
              </Show>
            </NodeContainer>
            <div
              data-no-pan="true"
              title="Drag to connect"
              style={{
                position: 'absolute',
                left: `${rn.x + delta().dx + size().width - 6}px`,
                top: `${rn.y + offsetY() + NODE_HEADER_HEIGHT / 2 - EDGE_TAB_SIZE / 2}px`,
                width: `${EDGE_TAB_SIZE}px`,
                height: `${EDGE_TAB_SIZE}px`,
                'z-index': '20',
                'border-radius': '9999px',
                background: 'var(--accent)',
                color: 'var(--on-accent, #fff)',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'font-size': '12px',
                opacity: tabVisible() ? '1' : '0',
                transition: 'opacity 150ms ease',
                'pointer-events': tabVisible() ? 'auto' : 'none',
                cursor: 'pointer',
              }}
              on:pointerdown={(e: PointerEvent) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                ctx.startConnection(id, null, e.clientX, e.clientY);
              }}
            >
              →
            </div>
            <For each={rn.isContainer ? (['entry', 'exit'] as const) : []}>
              {(kind) => (
                <BoundaryHandle
                  rect={portRect}
                  position={() => portPosition(kind)}
                  width={() => merinoPortDimensions(portPosition(kind)).width}
                  height={() => merinoPortDimensions(portPosition(kind)).height}
                  onPreview={(position) => updatePort(kind, position, false)}
                  onCommit={(position) => updatePort(kind, position, true)}
                  onCancel={() => { setDraggedPort(null); props.onPortCancel(); }}
                  style={{
                    'z-index': `${2 * rn.depth + 2}`,
                    'border-radius': '9999px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    opacity: `${portOpacity(kind)}`,
                    cursor: 'grab',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    color: 'var(--fg-muted)',
                    transition: 'opacity 120ms ease',
                  }}
                >
                  <span
                    data-merino-port={kind}
                    data-node-id={id}
                    onPointerEnter={() => setHoveredPort(kind)}
                    onPointerLeave={() => setHoveredPort(null)}
                    style={{ display: 'block', 'font-size': '8px', 'line-height': '1', transform: `rotate(${glyphRotation(kind)}deg)` }}
                  >›</span>
                </BoundaryHandle>
              )}
            </For>
          </div>
        );
      }}
    </For>
  );
}
