import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import type { MerinoAction, MerinoColorToken, MerinoDocument, MerinoTab } from '@luminous/core/merino';
import { MERINO_TABS, applyMerinoBatch } from '@luminous/core/merino';
import { Canvas, ConnectionPreview, NodeContainer, useCanvasContext, useGesture } from '@luminous/cactus';
import type { CanvasRef } from '@luminous/cactus';
import { NODE_HEADER_HEIGHT, NODE_HEIGHT, NODE_WIDTH, nodeTypeById, projectMerino, tokenVar, type MerinoRenderNode } from './projection.ts';
import { nodeContextMenu, backgroundContextMenu, edgeContextMenu, type MerinoMenuDeps } from './menus.tsx';
import { ManageTypesPanel } from './ManageTypesPanel.tsx';
import { copyMerinoSelection, pasteMerinoSelection, type MerinoClipboard } from './clipboard.ts';

const EDGE_TAB_SIZE = 18;

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, [contenteditable="true"]'));
}

const TAB_LABELS: Record<MerinoTab, string> = { requirements: 'Requirements', deployments: 'Deployments' };

export interface MerinoCanvasProps {
  doc: MerinoDocument;
  dispatchDoc: (next: MerinoDocument) => void;
  onRefused?: (message: string) => void;
  /** A non-expiring message describing the in-progress Edge gesture. */
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

  const projection = createMemo(() => projectMerino(props.doc, tab()));
  const renderNodes = createMemo(() => projection().nodes);
  const edges = createMemo(() => projection().edges);
  const typesById = createMemo(() => nodeTypeById(props.doc));

  const menuDeps: MerinoMenuDeps = { doc: () => props.doc, recentTypeIds };

  function dispatchAction(actions: MerinoAction[]): void {
    if (actions.length === 0) return;
    const result = applyMerinoBatch(props.doc, actions);
    if (!result.ok) {
      props.onRefused?.(result.error);
      return;
    }
    props.dispatchDoc(result.doc);
  }

  function firstNodeType(): string | undefined {
    return props.doc.nodeTypes[0]?.id;
  }

  function firstEdgeType(): string | undefined {
    return props.doc.edgeTypes[0]?.id;
  }

  function endDrag(nodeIds: ReadonlyArray<string>, dx: number, dy: number) {
    const positions = new Map(renderNodes().map((node) => [node.node.id, node]));
    dispatchAction(nodeIds.flatMap((id): MerinoAction[] => {
      const node = positions.get(id);
      return node ? [{ type: 'setNode', id, x: node.x + dx, y: node.y + dy }] : [];
    }));
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
    let x = 40;
    let y = 40;
    if (parent !== undefined) {
      const prn = renderNodes().find(n => n.node.id === parent);
      if (prn) { x = prn.x + 40; y = prn.y + NODE_HEIGHT + 48; }
    } else if (position !== undefined) {
      x = position.x;
      y = position.y;
    } else {
      const count = renderNodes().length;
      x = 40 + (count % 4) * (NODE_WIDTH + 48);
      y = 40 + Math.floor(count / 4) * (NODE_HEIGHT + 48);
    }
    dispatchAction([{ type: 'addNode', id, tab: tab(), nodeType, name: 'New node', parent, x, y }]);
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
          edges={edges()}
          edgeEmphasis={{ dimUnselected: false, selectedWidthMultiplier: 2 }}
          boxSelect={{
            trigger: 'drag',
            getNodeRects: () => renderNodes().map((node) => ({
              id: node.node.id, x: node.x, y: node.y, width: node.w, height: node.h,
            })),
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
            onRename={(nodeId, name) => dispatchAction([{ type: 'setNode', id: nodeId, name }])}
            onSetText={(nodeId, text) => dispatchAction([{ type: 'setNode', id: nodeId, text }])}
            onEdgePreviewChange={props.onEdgePreviewChange}
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
  onRename: (nodeId: string, name: string) => void;
  onSetText: (nodeId: string, text: string) => void;
  onEdgePreviewChange?: (message: string | null) => void;
}

/** Rendered inside <Canvas> so useCanvasContext resolves (same constraint as
 * Linen's and Atlas's node layers). */
function MerinoNodeLayer(props: MerinoNodeLayerProps): JSX.Element {
  const ctx = useCanvasContext();
  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    // Cactus owns the generic selection-group gesture; Merino owns only
    // persisting the resulting position changes.
    dragGroup: (nodeId) => {
      const selected = ctx.selectedIds();
      return selected.includes(nodeId) ? selected : [nodeId];
    },
    callbacks: { onDragEnd: (_nodeId, dx, dy, nodeIds) => props.onDragEnd(nodeIds, dx, dy) },
  });
  const dragDelta = (id: string) => {
    const g = gesture.gesture();
    if (g.kind !== 'draggingNode' || !gesture.draggedNodeIds().includes(id)) return { dx: 0, dy: 0 };
    return gesture.dragDelta();
  };

  // The gesture state belongs to cactus; this layer translates it into the
  // actor-aware sentence Merino shows in its reserved toast slot.
  createEffect(() => {
    const drag = ctx.connectionDrag();
    if (!drag) {
      props.onEdgePreviewChange?.(null);
      return;
    }
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
        const color = () => props.typeColor(rn.node.type);
        const stopDrag = (e: PointerEvent) => e.stopPropagation();
        return (
          <div onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <NodeContainer
              nodeId={id}
              x={() => rn.x + delta().dx}
              y={() => rn.y + delta().dy}
              w={() => rn.w}
              h={() => rn.h}
              visualBand={() => 10}
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
                        flex: '1 1 auto',
                        'min-height': '0',
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
                  <div style={{ flex: '1 1 auto', 'min-height': '0', padding: '0 8px 8px' }}>
                    <textarea
                      data-no-pan="true"
                      class="h-full w-full resize-none rounded border border-border bg-canvas px-2 py-1 text-xs text-fg placeholder:italic"
                      style={{ cursor: 'text' }}
                      placeholder="Add Details"
                      value={rn.node.text ?? ''}
                      ref={(el) => queueMicrotask(() => el.focus())}
                      on:pointerdown={stopDrag}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => props.onSetText(id, e.currentTarget.value)}
                    />
                  </div>
                </Show>
              </div>
            </NodeContainer>
            <div
              data-no-pan="true"
              title="Drag to connect"
              style={{
                position: 'absolute',
                left: `${rn.x + delta().dx + rn.w - 6}px`,
                top: `${rn.y + delta().dy + NODE_HEADER_HEIGHT / 2 - EDGE_TAB_SIZE / 2}px`,
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
          </div>
        );
      }}
    </For>
  );
}
