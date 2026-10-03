import { createEffect, createMemo, createSignal, For, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { ChevronLeft, ChevronRight, CirclePlus, Ellipsis, ExternalLink, GitBranchPlus, GripHorizontal, Link2, ListOrdered, Plus, Trash2, X, Zap } from 'lucide-solid';
import { Canvas, NodeContainer, dagLayout, useCanvasContext, useGesture } from '@luminous/cactus';
import type { CanvasRef, TidyNode } from '@luminous/cactus';
import { exportDenimDatabase, hydrateDenimDatabase, openDenimDatabase, type DenimDatabase, type DenimEdge, type DenimGraph, type DenimNode } from '@luminous/core/denim';
import { DocumentPicker } from '../../DocumentPicker';
import { AnchoredMenu, Button, computeAnchoredPosition, IconButton, MenuItem, MenuSeparator, MenuSubmenu, ToolbarSurface } from '../../ui';
import { createStaticDatabase, fetchServerSources, fetchStaticSources, type CanvasSource } from '../../sources';
import { SourceConflictError } from '../../sources/CanvasSource';
import { readParam, writeParam } from '../../urlState';
import { watchDocuments } from '../../ws/watchClient';
import {
  createDenimSession,
  DenimSessionContext,
  DenimPersistenceConflict,
  useDenimSession,
  type DenimSession,
} from './DenimSession';
import { DenimSaveStatusBadge } from './DenimSaveStatusBadge';
import { DenimActionsProvider, useDenimActions } from './DenimActions';
import { DenimStatusToast } from './DenimStatusToast';
import { NewProjectDialog } from './NewProjectDialog';

const NODE_W = 232;
const NODE_H = 142;
const ICON_SIZE = 15;
const NODE_THEME_SLOT: Record<string, number> = {
  Journey: 1,
  Action: 2,
  Capability: 5,
  Resource: 4,
  Organization: 6,
  Contract: 8,
};

type PickerState = { mode: 'include' | 'connect'; parentId?: string; anchor: HTMLElement };

function GraphCanvas(props: {
  selectedId: () => string | null;
  openPicker: (mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent) => void;
  onEdgeClick: (edgeId: string, screenX: number, screenY: number) => void;
}) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const graph = () => session.state.graph;
  const [editingSequenceParent, setEditingSequenceParent] = createSignal<string | null>(null);
  const layoutNodes = createMemo(() => {
    const parents = new Map<string, string>();
    for (const edge of graph().edges) {
      if (edge.type === 'parent-child' && !parents.has(edge.targetId)) parents.set(edge.targetId, edge.sourceId);
    }
    return graph().nodes.map((node): TidyNode => ({
      id: node.id,
      w: NODE_W,
      h: NODE_H,
      parentId: parents.get(node.id) ?? null,
    }));
  });
  const layoutEdges = createMemo(() => graph().edges
    .filter((edge) => edge.type === 'parent-child')
    .map((edge) => ({ source: edge.sourceId, target: edge.targetId })));
  const activeTab = () => session.state.tabs.find((tab) => tab.id === session.state.activeTabId)!;
  const edgeLabels = createMemo(() => {
    const labels = new Map<string, string>();
    const grouped = new Map<string, DenimEdge[]>();
    for (const edge of graph().edges) {
      if (edge.type !== 'parent-child' || edge.priority === null || edge.priority === undefined) continue;
      const siblings = grouped.get(edge.sourceId) ?? [];
      siblings.push(edge);
      grouped.set(edge.sourceId, siblings);
    }
    for (const [parentId, siblings] of grouped) {
      const mode = editingSequenceParent() === parentId ? 'priority' : activeTab().sequenceModes[parentId] ?? 'rank';
      const ordered = [...siblings].sort((a, b) => a.priority! - b.priority! || a.targetId.localeCompare(b.targetId));
      for (const [index, edge] of ordered.entries()) {
        labels.set(edge.id, mode === 'priority' ? String(edge.priority) : String(index + 1));
      }
    }
    return labels;
  });
  function initializeSequence(parentId: string): void {
    const ordered = graph().edges.filter((edge) => edge.type === 'parent-child' && edge.sourceId === parentId)
      .sort((a, b) => {
        const pa = positions().get(a.targetId) ?? { x: 0, y: 0 };
        const pb = positions().get(b.targetId) ?? { x: 0, y: 0 };
        return pa.x - pb.x || pa.y - pb.y || a.targetId.localeCompare(b.targetId);
      }).map((edge) => edge.targetId);
    void actions.initializeSequence(parentId, ordered);
  }
  function sequenceMode(parentId: string): 'rank' | 'priority' {
    return activeTab().sequenceModes[parentId] ?? 'rank';
  }
  function toggleSequenceMode(parentId: string): void {
    void actions.setSequenceMode(parentId, sequenceMode(parentId) === 'rank' ? 'priority' : 'rank');
  }
  let canvasRef: CanvasRef | undefined;
  let previousTabId = activeTab().id;
  const positions = createMemo(() => {
    const positions = dagLayout(layoutNodes(), layoutEdges());
    for (const [id, position] of Object.entries(activeTab().positions)) positions.set(id, position);
    return positions;
  });

  createEffect(() => {
    const tab = activeTab();
    if (tab.id === previousTabId) return;
    previousTabId = tab.id;
    const camera = session.state.cameras[tab.id];
    if (camera) canvasRef?.setView(camera, false);
    else requestFit();
  });

  let pendingFit = 0;
  function requestFit(): void {
    cancelAnimationFrame(pendingFit);
    pendingFit = requestAnimationFrame(() => {
      const rects = graph().nodes.flatMap((node) => {
        const position = positions().get(node.id);
        return position ? [{ x: position.x, y: position.y, width: NODE_W, height: NODE_H }] : [];
      });
      if (rects.length > 0) canvasRef?.fitView(rects, 72, false);
    });
  }

  onMount(() => {
    if (!session.state.cameras[activeTab().id]) requestFit();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      canvasRef?.clearSelection();
      session.selectNode(null);
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });
  onCleanup(() => cancelAnimationFrame(pendingFit));

  return (
    <Canvas ref={(handle) => { canvasRef = handle; }}
      onEdgeClick={props.onEdgeClick}
      boxSelect={{ trigger: 'drag' }}
      onSelectionChange={(ids) => session.selectNode(ids.at(-1) ?? null)}
      viewportOptions={{
        initialTransform: session.state.cameras[activeTab().id] ?? { x: 0, y: 0, k: 1 },
        onTransformChange: (camera) => session.setCamera(activeTab().id, camera),
      }}
      edges={graph().edges.filter((edge) => edge.type === 'parent-child').map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      labelText: edgeLabels().get(edge.id),
      labelEditValue: edge.priority == null ? undefined : String(edge.priority),
      onLabelEdit: (value) => {
        const priority = Number(value);
        if (Number.isFinite(priority)) void actions.setEdgePriority(edge.id, priority);
      },
      onLabelEditFocus: () => setEditingSequenceParent(edge.sourceId),
      onLabelEditBlur: () => setEditingSequenceParent(null),
      labelBackground: true,
      labelBackgroundColor: '#fff',
      labelBackgroundShape: 'circle',
      labelFontScale: 1.15,
      labelFontWeight: 600,
      styling: { arrowHead: true, dash: 'solid' as const },
    }))}>
      <CanvasNodes
        graph={graph()}
        positions={positions}
        tabId={() => activeTab().id}
        selectedId={props.selectedId}
        onSelect={session.selectNode}
        onSelectInCanvas={(id) => canvasRef?.setSelectedIds([id])}
        openPicker={props.openPicker}
        sequenceModeFor={sequenceMode}
        initializeSequence={initializeSequence}
        toggleSequenceMode={toggleSequenceMode}
      />
    </Canvas>
  );
}

function CanvasNodes(props: {
  graph: DenimGraph;
  positions: () => ReadonlyMap<string, { x: number; y: number }>;
  tabId: () => string;
  selectedId: () => string | null;
  onSelect: (id: string | null) => void;
  onSelectInCanvas: (id: string) => void;
  openPicker: (mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent) => void;
  sequenceModeFor: (parentId: string) => 'rank' | 'priority';
  initializeSequence: (parentId: string) => void;
  toggleSequenceMode: (parentId: string) => void;
}) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const ctx = useCanvasContext();
  const [dragOffsets, setDragOffsets] = createSignal<Record<string, { dx: number; dy: number }>>({});
  let dragStarts: Record<string, { x: number; y: number }> = {};
  let releaseFrame = 0;
  const drag = useGesture({
    zoomScale: () => ctx.transform().k,
    dragGroup: (nodeId) => ctx.isSelected(nodeId) ? ctx.selectedIds() : [nodeId],
    callbacks: {
      onDragStart: (_id, ids) => {
        dragStarts = Object.fromEntries(ids.flatMap((id) => {
          const position = props.positions().get(id);
          return position ? [[id, position]] : [];
        }));
      },
      onDrag: (_id, dx, dy, ids) => {
        cancelAnimationFrame(releaseFrame);
        setDragOffsets(Object.fromEntries(ids.map((id) => [id, { dx, dy }])));
      },
      onDragEnd: (_id, dx, dy, ids) => {
        const positions = Object.fromEntries(ids.flatMap((id) => {
          const start = dragStarts[id];
          return start ? [[id, { x: start.x + dx, y: start.y + dy }]] : [];
        }));
        if (Object.keys(positions).length) {
          void actions.moveNodes(positions, props.tabId());
          // Hold the preview until the saved positions become the layout source.
          releaseFrame = requestAnimationFrame(() => {
            releaseFrame = 0;
            setDragOffsets({});
          });
        } else {
          setDragOffsets({});
        }
        dragStarts = {};
      },
    },
  });
  onCleanup(() => cancelAnimationFrame(releaseFrame));

  async function differentiateNode(parentId: string): Promise<void> {
    const parent = props.positions().get(parentId);
    const placement = parent ? { tabId: props.tabId(), x: parent.x, y: parent.y + NODE_H + 80 } : undefined;
    const result = await actions.differentiate(parentId, undefined, placement);
    if (result.nodeId) props.onSelectInCanvas(result.nodeId);
  }

  return <For each={props.graph.nodes}>{(node) => {
    const basePosition = () => props.positions().get(node.id) ?? { x: 0, y: 0 };
    const pos = () => {
      const offset = dragOffsets()[node.id];
      const base = basePosition();
      return offset ? { x: base.x + offset.dx, y: base.y + offset.dy } : base;
    };
    return <NodeContainer nodeId={node.id} x={() => pos().x} y={() => pos().y} w={() => NODE_W} h={() => NODE_H}
      onPointerDown={(event) => {
        ctx.onNodePointerDown(node.id, event);
        props.onSelect(node.id);
        if ((event.target as HTMLElement).closest('[data-denim-drag-handle]')) drag.beginPress(node.id, event);
      }}>
      <NodeCard node={node} selected={props.selectedId() === node.id || ctx.isSelected(node.id)} onOpenJourney={() => void actions.openJourney(node.id)}
        onDifferentiate={() => void differentiateNode(node.id)}
        onConnect={(event) => props.openPicker('connect', node.id, event)}
        hasSequence={props.graph.edges.some((edge) => edge.sourceId === node.id && edge.priority != null)}
        graphChildCount={props.graph.edges.filter((edge) => edge.type === 'parent-child' && edge.sourceId === node.id).length}
        sequenceMode={props.sequenceModeFor(node.id)}
        onInitializeSequence={() => props.initializeSequence(node.id)}
        onClearSequence={() => void actions.clearSequence(node.id)}
        onToggleSequenceMode={() => props.toggleSequenceMode(node.id)} />
    </NodeContainer>;
  }}</For>;
}

function NodeCard(props: {
  node: DenimNode;
  selected: boolean;
  onOpenJourney: () => void;
  onDifferentiate: () => void;
  onConnect: (event: MouseEvent) => void;
  hasSequence: boolean;
  graphChildCount: number;
  sequenceMode: 'rank' | 'priority';
  onInitializeSequence: () => void;
  onClearSequence: () => void;
  onToggleSequenceMode: () => void;
}) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const [openNodeMenu, setOpenNodeMenu] = createSignal<'sequence' | 'delete' | null>(null);
  const [deleteSubmenu, setDeleteSubmenu] = createSignal<'single' | 'children' | null>(null);
  const deleteMenuRoots = new Set<HTMLElement>();
  let sequenceOptionsButton: HTMLButtonElement | undefined;
  let deleteButton: HTMLButtonElement | undefined;
  const types = createMemo(() => [...new Set([
    'Journey', 'Action', 'Capability', 'Resource', 'Organization', 'Contract', props.node.type,
  ])]);
  return <article class="lui-node-card relative flex h-full flex-col gap-2 rounded-lg p-3 transition-shadow"
    style={{
      background: `var(--theme-bg-${NODE_THEME_SLOT[props.node.type] ?? 1})`,
      border: '1px solid var(--theme-node-border)',
    }}
    classList={{ 'ring-2 ring-accent': props.selected }}>
    <div data-denim-drag-handle data-no-pan="true" aria-hidden="true"
      class="absolute inset-x-0 top-0 z-10 h-3 cursor-grab active:cursor-grabbing" />
    <div class="flex w-full shrink-0 items-center justify-between gap-2">
      <select aria-label="Node type" value={props.node.type}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === '__other__') {
            const custom = window.prompt('Type name', props.node.type);
            if (custom?.trim()) void actions.updateNode(props.node.id, { type: custom.trim() });
            event.currentTarget.value = props.node.type;
          } else void actions.updateNode(props.node.id, { type: value });
        }}
        class="w-[86%] cursor-pointer appearance-none bg-transparent pr-1 text-xs text-fg-muted outline-none focus-visible:text-fg">
        <For each={types()}>{(type) => <option value={type}>{type}</option>}</For>
        <option value="__other__">Other…</option>
      </select>
      <div data-denim-drag-handle data-no-pan="true" aria-label="Drag node" title="Drag node"
        class="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted active:cursor-grabbing">
        <GripHorizontal size={ICON_SIZE} strokeWidth={1.8} />
      </div>
    </div>
    <textarea aria-label="Node text" value={props.node.text}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => void actions.updateNode(props.node.id, { text: event.currentTarget.value })}
      class="min-h-0 flex-1 resize-none bg-transparent text-sm leading-5 text-fg outline-none focus-visible:ring-1 focus-visible:ring-accent/50" />
    <ToolbarSurface variant="node" class="absolute bottom-2 left-2" data-node-toolbar
      onPointerDown={(event) => event.stopPropagation()}>
      <Show when={props.node.type === 'Journey'}>
        <IconButton aria-label="Open Journey in a new tab" title="Open Journey in a new tab"
          onClick={(event) => { event.stopPropagation(); props.onOpenJourney(); }}>
          <ExternalLink size={ICON_SIZE} strokeWidth={1.7} />
        </IconButton>
      </Show>
      <div class="lui-node-toolbar__more">
        <span aria-hidden="true" class="lui-node-toolbar__expander">
          <Ellipsis size={ICON_SIZE} strokeWidth={1.7} />
        </span>
        <div class="lui-node-toolbar__actions">
          <IconButton aria-label="Differentiate node" title="Differentiate node" class="lui-node-toolbar__action"
            onClick={props.onDifferentiate}><GitBranchPlus size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
          <IconButton aria-label="Differentiate using an existing node" title="Differentiate using an existing node" class="lui-node-toolbar__action"
            onClick={(event) => { event.stopPropagation(); props.onConnect(event); }}><Link2 size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
          <div class="lui-node-toolbar__menu-anchor">
            <IconButton ref={sequenceOptionsButton} aria-label="Sequence options" title="Sequence options" class="lui-node-toolbar__action"
              aria-expanded={openNodeMenu() === 'sequence'} onClick={(event) => {
                event.stopPropagation();
                setOpenNodeMenu((current) => current === 'sequence' ? null : 'sequence');
              }}><ListOrdered size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
            <Show when={openNodeMenu() === 'sequence'}>
              <AnchoredMenu anchor={sequenceOptionsButton} label="Sequence options"
                onClose={() => setOpenNodeMenu(null)}>
                <MenuItem disabled={props.graphChildCount === 0}
                  onClick={() => { props.onInitializeSequence(); setOpenNodeMenu(null); }}>initialize sequence</MenuItem>
                <MenuItem disabled={!props.hasSequence}
                  onClick={() => { props.onClearSequence(); setOpenNodeMenu(null); }}>clear sequence</MenuItem>
                <MenuSeparator />
                <MenuItem role="menuitemcheckbox" aria-checked={props.sequenceMode === 'rank'} selected={props.sequenceMode === 'rank'} disabled={!props.hasSequence}
                  onClick={props.onToggleSequenceMode}>
                  <span>Show step numbers</span>
                  <Show when={props.sequenceMode === 'rank'}><span aria-hidden="true">✓</span></Show>
                </MenuItem>
              </AnchoredMenu>
            </Show>
          </div>
          <div class="lui-node-toolbar__menu-anchor">
            <IconButton ref={deleteButton} aria-label="Delete node" title="Delete node" danger class="lui-node-toolbar__action"
              aria-expanded={openNodeMenu() === 'delete'} onClick={(event) => {
                event.stopPropagation();
                setOpenNodeMenu((current) => {
                  const next = current === 'delete' ? null : 'delete';
                  if (!next) setDeleteSubmenu(null);
                  return next;
                });
              }}><Trash2 size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
            <Show when={openNodeMenu() === 'delete'}>
              <AnchoredMenu anchor={deleteButton} label="Delete node" relatedMenus={deleteMenuRoots}
                onClose={() => { setOpenNodeMenu(null); setDeleteSubmenu(null); }}>
                <MenuSubmenu label="Confirm deleting node" open={deleteSubmenu() === 'single'}
                  onOpen={() => setDeleteSubmenu('single')} onClose={() => setDeleteSubmenu(null)} relatedMenus={deleteMenuRoots}
                  trigger={<><span>Delete Node</span><ChevronRight size={14} /></>}>
                  <MenuItem danger onClick={() => { setOpenNodeMenu(null); setDeleteSubmenu(null); void actions.deleteNode(props.node.id, 'node'); }}>Confirm</MenuItem>
                </MenuSubmenu>
                <MenuSubmenu label="Confirm deleting node and children" open={deleteSubmenu() === 'children'}
                  onOpen={() => setDeleteSubmenu('children')} onClose={() => setDeleteSubmenu(null)} relatedMenus={deleteMenuRoots}
                  trigger={<><span>Delete Node and Children</span><ChevronRight size={14} /></>}>
                  <MenuItem danger onClick={() => { setOpenNodeMenu(null); setDeleteSubmenu(null); void actions.deleteNode(props.node.id, 'subtree'); }}>Confirm</MenuItem>
                </MenuSubmenu>
              </AnchoredMenu>
            </Show>
          </div>
        </div>
      </div>
    </ToolbarSurface>
  </article>;
}

function DenimAppToolbar() {
  const session = useDenimSession();
  const actions = useDenimActions();
  const [quickSelectOpen, setQuickSelectOpen] = createSignal(false);
  const [overflow, setOverflow] = createSignal(false);
  let quickSelectButton: HTMLButtonElement | undefined;
  let strip: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  const refreshOverflow = () => setOverflow(Boolean(strip && strip.scrollWidth > strip.clientWidth + 1));
  const tabs = () => session.state.tabs;
  const activate = (id: string) => {
    session.activateTab(id);
    setQuickSelectOpen(false);
  };

  onMount(() => {
    if (strip) {
      resizeObserver = new ResizeObserver(refreshOverflow);
      resizeObserver.observe(strip);
      refreshOverflow();
    }
  });
  createEffect(() => {
    tabs();
    queueMicrotask(refreshOverflow);
  });
  onCleanup(() => resizeObserver?.disconnect());

  function tabKey(event: KeyboardEvent, index: number): void {
    const to = event.key === 'ArrowRight' ? Math.min(index + 1, tabs().length - 1)
      : event.key === 'ArrowLeft' ? Math.max(index - 1, 0)
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs().length - 1 : -1;
    if (to < 0) return;
    event.preventDefault();
    const next = tabs()[to];
    activate(next.id);
    strip?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  }

  return <ToolbarSurface variant="app" class="relative">
    <div class="lui-toolbar__section">
      <IconButton ref={quickSelectButton} aria-label="Quick Select" title="Quick Select" aria-expanded={quickSelectOpen()}
        onClick={() => setQuickSelectOpen((open) => !open)}><Zap size={17} strokeWidth={1.8} /></IconButton>
      <Show when={quickSelectOpen()}>
        <AnchoredMenu anchor={quickSelectButton} label="Saved views" class="lui-menu-panel--wide" onClose={() => setQuickSelectOpen(false)}>
          <For each={tabs().filter((tab) => tab.kind === 'pinned')}>
            {(tab) => <MenuItem onClick={() => activate(tab.id)}>{tab.title}</MenuItem>}
          </For>
        </AnchoredMenu>
      </Show>
    </div>
    <div class="lui-toolbar__tab-area">
      <Show when={overflow()}>
        <IconButton aria-label="Scroll tabs left" title="Scroll tabs left" class="lui-tab-scroll"
          onClick={() => strip?.scrollBy({ left: -180, behavior: 'smooth' })}><ChevronLeft size={16} /></IconButton>
      </Show>
      <div ref={strip} role="tablist" aria-label="Denim views" class="lui-tab-strip"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            if (strip) strip.scrollLeft += event.deltaY;
          }
        }}>
        <For each={tabs()}>{(tab, index) => <div class="lui-tab-item"
          aria-selected={session.state.activeTabId === tab.id}>
          <button type="button" role="tab" aria-selected={session.state.activeTabId === tab.id}
            tabIndex={session.state.activeTabId === tab.id ? 0 : -1} title={tab.title} class="lui-tab"
            onClick={() => activate(tab.id)} onKeyDown={(event) => tabKey(event, index())}>{tab.title}</button>
          <Show when={tab.kind === 'workspace'}>
            <IconButton aria-label={`Close ${tab.title}`} title="Close tab" class="lui-tab-close"
              onClick={() => void actions.closeView(tab.id)}><X size={13} /></IconButton>
          </Show>
        </div>}</For>
      </div>
      <Show when={overflow()}>
        <IconButton aria-label="Scroll tabs right" title="Scroll tabs right" class="lui-tab-scroll"
          onClick={() => strip?.scrollBy({ left: 180, behavior: 'smooth' })}><ChevronRight size={16} /></IconButton>
      </Show>
    </div>
  </ToolbarSurface>;
}

function DenimWorkspace(props: { onReload: () => void }) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const [picker, setPicker] = createSignal<PickerState | null>(null);
  const [query, setQuery] = createSignal('');
  const [statusToast, setStatusToast] = createSignal<string | null>(null);
  const [edgeMenu, setEdgeMenu] = createSignal<{ edgeId: string; x: number; y: number } | null>(null);
  const activeTab = () => session.state.tabs.find((tab) => tab.id === session.state.activeTabId)!;
  const journeysView = () => activeTab().id === 'pinned:journeys';
  const results = createMemo(() => session.findNodesToConnect(query()));

  function openPicker(mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent): void {
    setQuery('');
    setPicker({ mode, parentId, anchor: event.currentTarget as HTMLElement });
  }

  function chooseNode(node: DenimNode): void {
    const current = picker();
    if (!current) return;
    const task = current.mode === 'connect' && current.parentId
      ? actions.connectExisting(current.parentId, node.id)
      : actions.includeNode(node.id);
    void task;
    setPicker(null);
  }

  async function connectToNode(parentId: string | undefined, childId: string): Promise<void> {
    if (!parentId || parentId === childId) return;
    await actions.connectExisting(parentId, childId);
    setPicker(null);
  }

  return <div class="flex min-h-0 flex-1 flex-col">
    <Show when={session.state.error}>
      {(message) => <div role="alert" class="flex items-center gap-3 px-4 py-2 text-sm text-red-700">
        <span>{message()}</span>
        <Show when={session.state.conflict}>
          <button class="underline" onClick={props.onReload}>Discard edits and reload</button>
        </Show>
        <Show when={session.state.dirty && !session.state.conflict}>
          <button class="underline" onClick={() => void session.retrySave()}>Retry save</button>
        </Show>
      </div>}
    </Show>
    <DenimAppToolbar />
    <div class="relative min-h-0 flex-1" onPointerDown={() => setEdgeMenu(null)}>
      <ToolbarSurface variant="floating" class="absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <Show when={journeysView()}>
          <IconButton aria-label="Add a Journey" title="Add a Journey"
            onClick={() => void actions.createJourney()}><Plus size={16} strokeWidth={1.8} /></IconButton>
        </Show>
        <IconButton aria-label="Add a node to this view" title="Add a node to this view"
          onClick={(event) => openPicker('include', undefined, event)}><Plus size={16} strokeWidth={1.8} /></IconButton>
      </ToolbarSurface>
      <GraphCanvas selectedId={() => session.state.selectedId} openPicker={openPicker}
        onEdgeClick={(edgeId, x, y) => setEdgeMenu({ edgeId, x, y })} />
      <div class="lui-feedback-tray pointer-events-none absolute bottom-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center justify-end gap-2">
        <DenimStatusToast message={statusToast} />
        <DenimSaveStatusBadge saving={() => session.state.saving} error={() => session.state.error} />
      </div>
    </div>
    <Show when={edgeMenu()}>
      {(menu) => <Portal>
        <div class="lui-edge-delete-anchor" style={{ left: `${Math.max(8, Math.min(menu().x - 34, window.innerWidth - 76))}px`, top: `${Math.max(8, Math.min(menu().y + 8, window.innerHeight - 40))}px` }}>
          <Button aria-label="Delete edge" title="Delete edge" tone="danger" class="lui-edge-delete"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => { const edgeId = menu().edgeId; setEdgeMenu(null); void actions.deleteEdge(edgeId); }}>
            <Trash2 size={13} strokeWidth={1.8} />
            <span>Delete</span>
          </Button>
        </div>
      </Portal>}
    </Show>
    <Show when={picker()}>
      {(current) => <FindNodePicker mode={current().mode} parentId={current().parentId} anchor={current().anchor}
        query={query} setQuery={setQuery} results={results}
        targetForId={(id) => session.state.graph.nodes.find((node) => node.id === id)}
        isValidTarget={(id) => Boolean(current().parentId && session.canConnectExisting(current().parentId!, id))}
        onChoose={chooseNode} onConnect={connectToNode} onClose={() => { setPicker(null); setStatusToast(null); }}
        onStatus={setStatusToast} />}
    </Show>
  </div>;
}

type ConnectionGesture = {
  kind: 'drag' | 'armed';
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
};

function FindNodePicker(props: {
  mode: PickerState['mode'];
  parentId?: string;
  anchor: HTMLElement;
  query: () => string;
  setQuery: (value: string) => void;
  results: () => DenimNode[];
  targetForId: (id: string) => DenimNode | undefined;
  isValidTarget: (id: string) => boolean;
  onChoose: (node: DenimNode) => void;
  onConnect: (parentId: string | undefined, childId: string) => Promise<void>;
  onClose: () => void;
  onStatus: (message: string | null) => void;
}) {
  const [gesture, setGesture] = createSignal<ConnectionGesture | null>(null);
  const [position, setPosition] = createSignal<{ left: number; top: number }>();
  const targetValidity = new Map<string, boolean>();
  let dialog: HTMLDivElement | undefined;
  let plusButton: HTMLButtonElement | undefined;
  let positionFrame = 0;
  let positionObserver: ResizeObserver | undefined;

  function updatePosition(): void {
    if (!dialog || !props.anchor.isConnected) return;
    positionFrame = 0;
    setPosition(computeAnchoredPosition(props.anchor.getBoundingClientRect(), dialog.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    }, { gap: 6 }));
  }

  function nodeIdAt(x: number, y: number): string | null {
    return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-container-id]')?.dataset.containerId ?? null;
  }

  function isValidTarget(id: string): boolean {
    if (!targetValidity.has(id)) targetValidity.set(id, props.isValidTarget(id));
    return targetValidity.get(id)!;
  }

  function finishConnection(childId: string | null): void {
    const current = gesture();
    if (!current) return;
    setGesture(null);
    props.onStatus(null);
    if (childId && isValidTarget(childId)) void props.onConnect(props.parentId, childId);
  }

  function beginGesture(kind: ConnectionGesture['kind']): void {
    const rect = plusButton?.getBoundingClientRect();
    if (!rect) return;
    setGesture({ kind, startX: rect.left + rect.width / 2, startY: rect.top + rect.height / 2,
      pointerX: rect.left + rect.width / 2, pointerY: rect.top + rect.height / 2 });
    props.onStatus('Differentiating to existing Node');
  }

  function cancelGesture(): void {
    setGesture(null);
    props.onStatus(null);
  }

  function onPointerMove(event: PointerEvent): void {
    const current = gesture();
    if (!current) return;
    setGesture({ ...current, pointerX: event.clientX, pointerY: event.clientY });
    const targetId = nodeIdAt(event.clientX, event.clientY);
    const target = targetId ? props.targetForId(targetId) : undefined;
    if (target && isValidTarget(target.id)) {
      const text = target.text.trim() || 'Untitled';
      const beginning = text.length > 7 ? `${text.slice(0, 7).trimEnd()}...` : text;
      props.onStatus(`Differentiating to "${beginning}" (${target.type})`);
    } else {
      props.onStatus('Differentiating to existing Node');
    }
  }

  function onPointerUp(event: PointerEvent): void {
    const current = gesture();
    if (current?.kind !== 'drag') return;
    const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 5;
    if (moved) finishConnection(nodeIdAt(event.clientX, event.clientY));
    else cancelGesture();
  }

  function onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Node && dialog?.contains(target)) return;
    const current = gesture();
    if (current?.kind === 'drag') return;
    if (current?.kind === 'armed') {
      const childId = nodeIdAt(event.clientX, event.clientY);
      if (childId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finishConnection(childId);
        return;
      }
    }
    props.onClose();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (gesture()) cancelGesture();
    else props.onClose();
  }

  onMount(() => {
    positionFrame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('scroll', updatePosition, true);
    if (typeof ResizeObserver !== 'undefined') {
      positionObserver = new ResizeObserver(updatePosition);
      if (dialog) positionObserver.observe(dialog);
      positionObserver.observe(props.anchor);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  });
  onCleanup(() => {
    cancelAnimationFrame(positionFrame);
    positionObserver?.disconnect();
    window.removeEventListener('resize', updatePosition);
    document.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    props.onStatus(null);
  });

  function curvePath(current: ConnectionGesture): string {
    const dx = current.pointerX - current.startX;
    const dy = current.pointerY - current.startY;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return `M ${current.startX} ${current.startY} L ${current.pointerX} ${current.pointerY}`;

    const ux = dx / distance;
    const uy = dy / distance;
    const nx = -uy;
    const ny = ux;
    const bend = Math.min(100, Math.max(32, distance * 0.2));
    const midX = current.startX + dx * 0.5;
    const midY = current.startY + dy * 0.5;
    const quarterX = dx * 0.25;
    const quarterY = dy * 0.25;
    const bendX = nx * bend;
    const bendY = ny * bend;

    return `M ${current.startX} ${current.startY}`
      + ` C ${current.startX + quarterX + bendX} ${current.startY + quarterY + bendY}`
      + `, ${midX - quarterX + bendX} ${midY - quarterY + bendY}, ${midX} ${midY}`
      + ` C ${midX + quarterX - bendX} ${midY + quarterY - bendY}`
      + `, ${current.pointerX - quarterX - bendX} ${current.pointerY - quarterY - bendY}, ${current.pointerX} ${current.pointerY}`;
  }

  return <Portal mount={document.body}>
    <Show when={gesture()}>{(current) => <svg aria-hidden="true" class="pointer-events-none fixed inset-0 z-[49] h-full w-full overflow-visible">
      <path d={curvePath(current())} fill="none" stroke="var(--fg-muted)" stroke-width="1.5" stroke-dasharray="5 5" />
    </svg>}</Show>
    <div ref={dialog} role="dialog" aria-label={props.mode === 'include' ? 'Add node to view' : 'Choose node to connect'}
      class="fixed z-50 flex max-h-[calc(100vh-16px)] w-72 max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface p-2 shadow-xl"
      style={{ left: `${position()?.left ?? 0}px`, top: `${position()?.top ?? 0}px`, visibility: position() ? 'visible' : 'hidden' }}>
      <div class="relative flex items-center gap-1">
        <input autofocus value={props.query()} onInput={(event) => props.setQuery(event.currentTarget.value)}
          placeholder="Find a node" aria-label="Find a node"
          class="min-w-0 flex-1 bg-transparent px-2 py-2 pr-8 text-sm text-fg outline-none placeholder:text-fg-muted" />
        <Show when={props.mode === 'connect'}>
          <button ref={plusButton} type="button" aria-label="Start connection" title="Drag to a node or click, then choose a node"
            class="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); beginGesture('drag'); }}
            onClick={(event) => {
              event.stopPropagation();
              if (gesture()?.kind === 'armed') cancelGesture();
              else beginGesture('armed');
            }}><CirclePlus size={20} strokeWidth={1.7} /></button>
        </Show>
        <button type="button" aria-label="Close" class="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface-alt hover:text-fg"
          onClick={props.onClose}><X size={14} /></button>
      </div>
      <div class="min-h-0 max-h-64 flex-1 overflow-y-auto">
        <Show when={props.results().length > 0} fallback={<p class="px-2 py-3 text-xs text-fg-muted">No matching nodes</p>}>
          <For each={props.results()}>{(node) => <button type="button"
            class="flex w-full flex-col rounded px-2 py-2 text-left hover:bg-surface-alt focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
            onClick={() => props.onChoose(node)}>
            <span class="text-sm text-fg">{node.text || 'Untitled'}</span>
            <span class="text-xs text-fg-muted">{node.type}</span>
          </button>}</For>
        </Show>
      </div>
    </div>
  </Portal>;
}

export function DenimApp() {
  const [sources, setSources] = createSignal<CanvasSource[]>([]);
  const [source, setSource] = createSignal<CanvasSource | null>(null);
  const [session, setSession] = createSignal<DenimSession | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [creatingIn, setCreatingIn] = createSignal<CanvasSource | null>(null);
  const initialSrc = readParam('src');
  let stopWatching: (() => void) | undefined;

  async function openSource(item: CanvasSource): Promise<void> {
    setLoading(true);
    setError(null);
    let database: DenimDatabase | undefined;
    try {
      if (!item.loadBytes || !item.saveBytes) throw new Error('This source cannot read and save SQLite databases');
      const loaded = await item.loadBytes();
      database = await openDenimDatabase(loaded.bytes, `${import.meta.env.BASE_URL}sql-wasm-browser.wasm`);
      const previous = session();
      stopWatching?.();
      stopWatching = undefined;
      if (previous) await previous.dispose();
      setSource(item);
      let knownRevision = loaded.revision;
      setSession(createDenimSession(database, async (bytes, revision) => {
        try {
          knownRevision = await item.saveBytes!(bytes, revision);
          return knownRevision;
        } catch (cause) {
          if (cause instanceof SourceConflictError) throw new DenimPersistenceConflict(cause.message);
          throw cause;
        }
      }, loaded.revision, item.id));
      if (!__STATIC__) {
        const openedSession = session()!;
        stopWatching = watchDocuments((changedPath, message) => {
          if (changedPath !== item.id || message?.revision === knownRevision || openedSession.state.dirty || openedSession.state.saving) return;
          void reloadSource().then(() => {
            if (message?.activateTabId) session()?.activateTab(message.activateTabId);
          });
        });
      }
      writeParam('src', item.id);
    } catch (cause) {
      database?.close();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  async function reloadSource(): Promise<void> {
    const current = session();
    const item = source();
    if (!current || !item) return;
    await current.discard();
    setSession(null);
    await openSource(item);
  }

  async function closeSource(): Promise<void> {
    stopWatching?.();
    stopWatching = undefined;
    const current = session();
    if (current) {
      try {
        await current.dispose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
    }
    setSession(null);
    setSource(null);
    writeParam('src', null);
  }

  async function createProject(name: string): Promise<void> {
    const representative = creatingIn();
    if (!representative) return;
    const slash = representative.id.lastIndexOf('/');
    const directory = __STATIC__
      ? `${representative.root}/`
      : slash === -1 ? '' : representative.id.slice(0, slash + 1);
    const path = `${directory}${name}.denim.sqlite`;
    setCreatingIn(null);
    setLoading(true);
    setError(null);
    let database: DenimDatabase | undefined;
    try {
      database = await openDenimDatabase(undefined, `${import.meta.env.BASE_URL}sql-wasm-browser.wasm`);
      hydrateDenimDatabase(database);
      const bytes = exportDenimDatabase(database);
      database.close();
      database = undefined;
      if (__STATIC__) {
        await createStaticDatabase(path, bytes);
        const list = await fetchStaticSources('.denim.sqlite');
        setSources(list);
        const created = list.find((item) => item.id === path);
        if (!created) throw new Error('Created project was not listed by the database picker');
        await openSource(created);
      } else {
        const response = await fetch(`/api/denim/database/${encodeURIComponent(path)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/vnd.sqlite3' }, body: bytes as BodyInit,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Failed to create project (${response.status})`);
        }
        const list = await fetchServerSources('.denim.sqlite');
        setSources(list);
        const created = list.find((item) => item.id === path);
        if (!created) throw new Error('Created project was not listed by the database picker');
        await openSource(created);
      }
    } catch (cause) {
      database?.close();
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
    }
  }

  onMount(async () => {
    try {
      const list = await (__STATIC__ ? fetchStaticSources('.denim.sqlite') : fetchServerSources('.denim.sqlite'));
      setSources(list);
      const initial = initialSrc && list.find((item) => item.id === initialSrc);
      if (initial) await openSource(initial);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  });

  onCleanup(() => {
    stopWatching?.();
    const current = session();
    if (current) void current.dispose().catch((cause: unknown) => console.error('[Denim] session closed with unsaved changes', cause));
  });

  return <>
    <Portal mount={document.getElementById('app-header-left')!}>
      <Show when={source()}>{(file) => <>
        <button onClick={() => void closeSource()}
          class="rounded px-2 py-1 text-sm text-fg-muted hover:bg-surface-alt hover:text-fg" title="Choose another database">
          ← Databases
        </button>
        <span class="text-sm text-fg-muted">{file().label}</span>
      </>}</Show>
    </Portal>
    <div class="flex min-h-0 flex-1 flex-col">
      <Show when={error()}>{(message) => <div role="alert" class="px-4 py-2 text-sm text-red-700">{message()}</div>}</Show>
      <Show when={session()} fallback={<Switch>
        <Match when={loading()}><div class="flex flex-1 items-center justify-center text-sm text-fg-muted">Loading…</div></Match>
        <Match when={!loading()}><DocumentPicker heading="Denim databases" sources={sources()} onSelect={(item) => void openSource(item)}
          createTitle="New project" onCreate={(item) => setCreatingIn(item)} /></Match>
      </Switch>}>
        {(active) => <DenimSessionContext.Provider value={active()}><DenimActionsProvider session={active()}><DenimWorkspace onReload={() => void reloadSource()} /></DenimActionsProvider></DenimSessionContext.Provider>}
      </Show>
    </div>
    <Show when={creatingIn()}>{(representative) => <NewProjectDialog root={representative().rootDir ?? representative().root}
      existingNames={sources().filter((item) => item.root === representative().root).map((item) => item.label)}
      onCancel={() => setCreatingIn(null)} onSubmit={(name) => void createProject(name)} />}</Show>
  </>;
}
