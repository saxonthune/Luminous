import { createEffect, createMemo, createSignal, For, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import ChevronLeft from 'lucide-solid/icons/chevron-left';
import ChevronRight from 'lucide-solid/icons/chevron-right';
import CirclePlus from 'lucide-solid/icons/circle-plus';
import Ellipsis from 'lucide-solid/icons/ellipsis';
import ExternalLink from 'lucide-solid/icons/external-link';
import GitBranchPlus from 'lucide-solid/icons/git-branch-plus';
import GripHorizontal from 'lucide-solid/icons/grip-horizontal';
import Link2 from 'lucide-solid/icons/link-2';
import ListOrdered from 'lucide-solid/icons/list-ordered';
import Plus from 'lucide-solid/icons/plus';
import SquareDashed from 'lucide-solid/icons/square-dashed';
import Trash2 from 'lucide-solid/icons/trash';
import X from 'lucide-solid/icons/x';
import Zap from 'lucide-solid/icons/zap';
import { Canvas, NodeContainer, dagLayout, useCanvasContext, useGesture } from '@luminous/cactus';
import { directRectRoute } from '@luminous/cactus/layout';
import type { CanvasRef, EdgeDeclaration, TidyNode, Transform } from '@luminous/cactus';
import { exportDenimDatabase, hydrateDenimDatabase, openDenimDatabase, type DenimDatabase, type DenimGraph, type DenimNode } from '@luminous/core/denim';
import { denimBoardToExcalidraw } from '@luminous/core/denim/excalidraw';
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
  type DenimBoard,
  type DenimBoardContainer,
  type DenimSession,
} from './DenimSession';
import { deriveDenimCanvasModel, deriveDenimSequenceLabels, previewDenimContainerDrag, type DenimContainerDragPreview } from './DenimProjection';
import { DenimSaveStatusBadge } from './DenimSaveStatusBadge';
import { DenimActionsProvider, useDenimActions } from './DenimActions';
import { DenimStatusToast } from './DenimStatusToast';
import { NewProjectDialog } from './NewProjectDialog';
import { DenimNodeVisibilityMenu } from './DenimNodeVisibilityMenu';

const NODE_W = 232;
const NODE_H = 142;
const CONTAINER_W = 360;
const CONTAINER_H = 280;
const ICON_SIZE = 15;
const containerVisualId = (headNodeId: string) => `denim-container:${headNodeId}`;
const NODE_THEME_SLOT: Record<string, number> = {
  Journey: 1,
  Action: 2,
  Capability: 5,
  Instance: 4,
  Organization: 6,
  Module: 7,
  Contract: 8,
};

type PickerState = { mode: 'include' | 'connect'; parentId?: string; anchor: HTMLElement };
type VisibilityQueryKind = 'board' | 'downstream' | 'container';
type OpenNodeVisibility = (kind: VisibilityQueryKind, nodeId: string | undefined, position: { x: number; y: number }) => void;
type VisibilityMenuState = { kind: VisibilityQueryKind; nodeId?: string; boardId: string; boardTitle: string; title: string; x: number; y: number };

function GraphCanvas(props: {
  selectedId: () => string | null;
  openPicker: (mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent) => void;
  onEdgeClick: (edgeId: string, screenX: number, screenY: number, canvasX: number, canvasY: number) => void;
  onEdgeHover: (edgeId: string, screenX: number, screenY: number, canvasX: number, canvasY: number) => void;
  onViewportTransform: (transform: Transform) => void;
  onStatus: (message: string | null) => void;
  onOpenNodeVisibility: OpenNodeVisibility;
}) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const graph = () => session.state.graph;
  const databaseGraph = createMemo(() => {
    session.state.graph.nodes;
    return session.databaseGraph();
  });
  const [editingSequenceParent, setEditingSequenceParent] = createSignal<string | null>(null);
  const [containerDragPreview, setContainerDragPreview] = createSignal<DenimContainerDragPreview | null>(null);
  onMount(() => {
    if (import.meta.env.DEV) console.info('[Denim startup]', {
      phase: 'graph canvas mounted', nodeCount: graph().nodes.length, edgeCount: graph().edges.length,
    });
  });
  const activeBoard = () => session.state.boards.find((board) => board.id === session.state.activeBoardId)!;
  const baseCanvasModel = createMemo(() => deriveDenimCanvasModel({
    graph: graph(),
    board: activeBoard(),
    nodeWidth: NODE_W,
    nodeHeight: NODE_H,
    containerHeaderHeight: 44,
  }));
  const sequenceLabels = createMemo(() => deriveDenimSequenceLabels(graph(), activeBoard(), editingSequenceParent()));
  const previewModel = createMemo(() => previewDenimContainerDrag({
    model: baseCanvasModel(),
    graph: graph(),
    board: activeBoard(),
    nodeWidth: NODE_W,
    nodeHeight: NODE_H,
    containerHeaderHeight: 44,
    preview: containerDragPreview(),
  }));
  const positions = createMemo(() => previewModel().positions);
  const edgeModel = createMemo(() => previewModel().edges);
  const canvasEdges = createMemo<EdgeDeclaration[]>(() => edgeModel().map((edge) => {
    if (edge.kind === 'sequence') return {
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      labelText: sequenceLabels().get(edge.id),
      labelEditValue: edge.priority == null ? undefined : String(edge.priority),
      onLabelEdit: (value: string) => {
        const priority = Number(value);
        if (Number.isFinite(priority)) void actions.setEdgePriority(edge.id, priority);
      },
      onLabelEditFocus: () => setEditingSequenceParent(edge.sourceId),
      onLabelEditBlur: () => setEditingSequenceParent(null),
      labelBackground: true,
      labelBackgroundColor: '#fff',
      labelBackgroundShape: 'circle' as const,
      labelFontScale: 1.15,
      labelFontWeight: 600,
      contentOverlays: edge.contentOverlays,
      styling: { arrowHead: true, dash: 'solid' as const },
    };
    if (edge.kind === 'container-owner') return {
      id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId,
      routeBuilder: (rects) => {
        const source = rects.get(edge.sourceId);
        const target = rects.get(edge.targetId);
        return source && target ? directRectRoute(source, target, edge.routeBand) : null;
      },
      styling: { dash: 'dashed' as const, curve: 'bezier' as const, colorToken: 'accent', width: 1.5 },
    };
    return {
      id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId,
      styling: { dash: 'dotted' as const, curve: 'bezier' as const, colorToken: 'accent', width: 1.5 },
    };
  }));
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
    return activeBoard().sequenceModes[parentId] ?? 'rank';
  }
  function toggleSequenceMode(parentId: string): void {
    void actions.setSequenceMode(parentId, sequenceMode(parentId) === 'rank' ? 'priority' : 'rank');
  }
  let canvasRef: CanvasRef | undefined;
  let boardContextPosition = { x: 0, y: 0 };
  let previousBoardId = activeBoard().id;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  async function spawnContainer(headNodeId: string): Promise<void> {
    const head = graph().nodes.find((node) => node.id === headNodeId);
    const position = positions().get(headNodeId);
    if (!head || !position) return;
    const boardId = activeBoard().id;
    const container: DenimBoardContainer = {
      x: position.x + NODE_W + 100,
      y: position.y,
      width: CONTAINER_W,
      height: CONTAINER_H,
    };
    clearTimeout(statusTimer);
    props.onStatus(`Spawning a Container for ${head.text}…`);
    const result = await actions.spawnContainer(headNodeId, container, boardId);
    if (!result.ok) {
      props.onStatus(`Could not spawn Container: ${result.error ?? 'unknown error'}`);
      statusTimer = setTimeout(() => props.onStatus(null), 5000);
      return;
    }
    props.onStatus(`Container spawned for ${head.text}`);
    statusTimer = setTimeout(() => props.onStatus(null), 2400);
    canvasRef?.fitView([
      { x: position.x, y: position.y, width: NODE_W, height: NODE_H },
      { x: container.x, y: container.y, width: container.width, height: container.height },
    ], 72, false);
  }

  createEffect(() => {
    const board = activeBoard();
    if (board.id === previousBoardId) return;
    previousBoardId = board.id;
    const camera = session.state.cameras[board.id];
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
      rects.push(...Object.values(activeBoard().containers).map((container) => ({
        x: container.x, y: container.y, width: container.width, height: container.height,
      })));
      if (rects.length > 0) canvasRef?.fitView(rects, 72, false);
    });
  }

  onMount(() => {
    if (!session.state.cameras[activeBoard().id]) requestFit();
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
  onCleanup(() => {
    cancelAnimationFrame(pendingFit);
    clearTimeout(statusTimer);
  });

  return (
    <Canvas ref={(handle) => { canvasRef = handle; }}
      onEdgeClick={(edgeId, x, y, canvasX, canvasY) => {
        const detachedId = edgeId.startsWith('denim-detached:') ? edgeId.slice('denim-detached:'.length) : null;
        if (detachedId && graph().edges.some((edge) => edge.id === detachedId && edge.type === 'contains')) props.onEdgeClick(detachedId, x, y, canvasX, canvasY);
        else if (graph().edges.some((edge) => edge.id === edgeId && edge.type === 'parent-child')) props.onEdgeClick(edgeId, x, y, canvasX, canvasY);
      }}
      onEdgeHover={(edgeId, x, y, canvasX, canvasY) => {
        const detachedId = edgeId.startsWith('denim-detached:') ? edgeId.slice('denim-detached:'.length) : null;
        if (detachedId && graph().edges.some((edge) => edge.id === detachedId && edge.type === 'contains')) props.onEdgeHover(detachedId, x, y, canvasX, canvasY);
      }}
      backgroundContextMenu={(position) => {
        boardContextPosition = { x: position.clientX, y: position.clientY };
        return { id: 'denim-board-context-menu', items: [{ type: 'action', action: { id: 'denim.board.add-node', label: 'Add node' } }] };
      }}
      onAction={(id) => {
        if (id === 'denim.board.add-node') props.onOpenNodeVisibility('board', undefined, boardContextPosition);
      }}
      boxSelect={{ trigger: 'drag' }}
      onSelectionChange={(ids) => session.selectNode(ids.at(-1) ?? null)}
      viewportOptions={{
        initialTransform: session.state.cameras[activeBoard().id] ?? { x: 0, y: 0, k: 1 },
        onTransformChange: (camera) => {
          session.setCamera(activeBoard().id, camera);
          props.onViewportTransform(camera);
        },
      }}
      edges={canvasEdges()}>
      <CanvasNodes
        graph={graph()}
        databaseGraph={databaseGraph}
        onOpenNodeVisibility={props.onOpenNodeVisibility}
        positions={positions}
        nodeDepths={() => previewModel().nodeDepths}
        containerDepths={() => previewModel().containerDepths}
        boardId={() => activeBoard().id}
        containers={() => activeBoard().containers}
        containerDragPreview={containerDragPreview}
        onContainerDragPreview={setContainerDragPreview}
        selectedId={props.selectedId}
        onSelect={session.selectNode}
        onSelectInCanvas={(id) => canvasRef?.setSelectedIds([id])}
        openPicker={props.openPicker}
        onSpawnContainer={spawnContainer}
        sequenceModeFor={sequenceMode}
        initializeSequence={initializeSequence}
        toggleSequenceMode={toggleSequenceMode}
      />
    </Canvas>
  );
}

function CanvasNodes(props: {
  graph: DenimGraph;
  databaseGraph: () => DenimGraph;
  onOpenNodeVisibility: OpenNodeVisibility;
  positions: () => ReadonlyMap<string, { x: number; y: number }>;
  nodeDepths: () => ReadonlyMap<string, number>;
  containerDepths: () => ReadonlyMap<string, number>;
  onContainerDragPreview: (preview: DenimContainerDragPreview | null) => void;
  boardId: () => string;
  containers: () => DenimBoard['containers'];
  containerDragPreview: () => DenimContainerDragPreview | null;
  selectedId: () => string | null;
  onSelect: (id: string | null) => void;
  onSelectInCanvas: (id: string) => void;
  openPicker: (mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent) => void;
  onSpawnContainer: (headNodeId: string) => Promise<void>;
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
          void actions.moveNodes(positions, props.boardId());
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
    const placement = parent ? { boardId: props.boardId(), x: parent.x, y: parent.y + NODE_H + 80 } : undefined;
    const result = await actions.differentiate(parentId, undefined, placement);
    if (result.nodeId) props.onSelectInCanvas(result.nodeId);
  }

  return <>
    <For each={Object.keys(props.containers())}>{(headNodeId) => {
      const head = () => props.graph.nodes.find((node) => node.id === headNodeId);
      return <Show when={head() ? props.containers()[headNodeId] : undefined}>{(container) => <ContainerVisual
        head={head()!}
        depth={() => props.containerDepths().get(headNodeId) ?? 0}
        boardId={props.boardId}
        container={() => container()}
        positions={props.positions}
        nodes={props.graph.nodes}
        databaseGraph={props.databaseGraph}
        containers={props.containers}
        dragPreview={props.containerDragPreview}
        onDragPreview={props.onContainerDragPreview}
        onCreated={props.onSelectInCanvas}
        onOpenNodeVisibility={props.onOpenNodeVisibility}
      />}</Show>;
    }}</For>
    <For each={props.graph.nodes}>{(node) => {
    const basePosition = () => props.positions().get(node.id) ?? { x: 0, y: 0 };
    const pos = createMemo(() => {
      const offset = dragOffsets()[node.id];
      const base = basePosition();
      return offset ? { x: base.x + offset.dx, y: base.y + offset.dy } : base;
    });
    return <NodeContainer nodeId={node.id} x={() => pos().x} y={() => pos().y} w={() => NODE_W} h={() => NODE_H}
      visualBand={() => 2 + 2 * (props.nodeDepths().get(node.id) ?? 0)}
      onPointerDown={(event) => {
        ctx.onNodePointerDown(node.id, event);
        props.onSelect(node.id);
        if ((event.target as HTMLElement).closest('[data-denim-drag-handle]')) drag.beginPress(node.id, event);
      }}>
      <NodeCard node={node} selected={props.selectedId() === node.id || ctx.isSelected(node.id)} onOpenJourney={() => void actions.openJourney(node.id)}
        databaseGraph={props.databaseGraph}
        onOpenNodeVisibility={props.onOpenNodeVisibility}
        onDifferentiate={() => void differentiateNode(node.id)}
        hasContainer={Boolean(props.containers()[node.id])}
        onSpawnContainer={() => void props.onSpawnContainer(node.id)}
        onConnect={(event) => props.openPicker('connect', node.id, event)}
        hasSequence={props.graph.edges.some((edge) => edge.sourceId === node.id && edge.priority != null)}
        graphChildCount={props.graph.edges.filter((edge) => edge.type === 'parent-child' && edge.sourceId === node.id).length}
        sequenceMode={props.sequenceModeFor(node.id)}
        onInitializeSequence={() => props.initializeSequence(node.id)}
        onClearSequence={() => void actions.clearSequence(node.id)}
        onToggleSequenceMode={() => props.toggleSequenceMode(node.id)} />
    </NodeContainer>;
  }}</For>
  </>;
}

function ContainerVisual(props: {
  head: DenimNode;
  depth: () => number;
  boardId: () => string;
  container: () => DenimBoardContainer;
  positions: () => ReadonlyMap<string, { x: number; y: number }>;
  nodes: DenimNode[];
  databaseGraph: () => DenimGraph;
  containers: () => DenimBoard['containers'];
  dragPreview: () => DenimContainerDragPreview | null;
  onDragPreview: (preview: DenimContainerDragPreview | null) => void;
  onCreated: (nodeId: string) => void;
  onOpenNodeVisibility: OpenNodeVisibility;
}) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const ctx = useCanvasContext();
  const id = containerVisualId(props.head.id);
  const memberCounts = () => {
    const all = props.databaseGraph();
    const loaded = new Set(session.state.graph.nodes.map((node) => node.id));
    const members = all.edges.filter((edge) => edge.type === 'contains' && edge.sourceId === props.head.id);
    return { loaded: members.filter((edge) => loaded.has(edge.targetId)).length, total: members.length };
  };
  const [offset, setOffset] = createSignal<{ x: number; y: number } | null>(null);
  const [resize, setResize] = createSignal<{ width: number; height: number } | null>(null);
  let carried: Record<string, { x: number; y: number }> = {};
  let carriedContainers: Record<string, { x: number; y: number }> = {};
  const drag = useGesture({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragStart: () => {
        const box = props.container();
        carried = Object.fromEntries(props.nodes.flatMap((node) => {
          if (node.id === props.head.id) return [];
          const point = props.positions().get(node.id);
          if (!point) return [];
          const overlaps = point.x < box.x + box.width && point.x + NODE_W > box.x
            && point.y < box.y + box.height && point.y + NODE_H > box.y + 44;
          return overlaps ? [[node.id, point]] : [];
        }));
        carriedContainers = Object.fromEntries(Object.entries(props.containers())
          .filter(([containerHeadId]) => containerHeadId in carried)
          .map(([containerHeadId, nested]) => [containerHeadId, { x: nested.x, y: nested.y }]));
      },
      onDrag: (_nodeId, dx, dy) => {
        setOffset({ x: dx, y: dy });
        props.onDragPreview({ headNodeId: props.head.id, dx, dy,
          carriedNodeIds: Object.keys(carried), carriedContainerIds: Object.keys(carriedContainers) });
      },
      onDragEnd: (_nodeId, dx, dy) => {
        const container = props.container();
        const carriedPositions = Object.fromEntries(Object.entries(carried).map(([nodeId, point]) => [nodeId, { x: point.x + dx, y: point.y + dy }]));
        const carriedContainerPositions = Object.fromEntries(Object.entries(carriedContainers)
          .map(([containerHeadId, point]) => [containerHeadId, { x: point.x + dx, y: point.y + dy }]));
        void actions.moveContainer(props.head.id, { x: container.x + dx, y: container.y + dy },
          props.boardId(), carriedPositions, carriedContainerPositions);
        carried = {};
        carriedContainers = {};
        props.onDragPreview(null);
        setOffset(null);
      },
    },
  });
  const position = () => {
    const container = props.container();
    const ownDelta = offset();
    const activePreview = props.dragPreview();
    const inheritedDelta = activePreview && activePreview.headNodeId !== props.head.id
      && activePreview.carriedContainerIds.includes(props.head.id) ? activePreview : null;
    const delta = ownDelta ?? (inheritedDelta ? { x: inheritedDelta.dx, y: inheritedDelta.dy } : null);
    return { x: container.x + (delta?.x ?? 0), y: container.y + (delta?.y ?? 0) };
  };
  function beginResize(event: PointerEvent): void {
    event.preventDefault(); event.stopPropagation();
    const start = props.container();
    const startX = event.clientX, startY = event.clientY;
    const onMove = (move: PointerEvent) => setResize({
      width: Math.max(220, start.width + (move.clientX - startX) / ctx.transform().k),
      height: Math.max(140, start.height + (move.clientY - startY) / ctx.transform().k),
    });
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      const next = resize();
      if (next) void actions.resizeContainer(props.head.id, next, props.boardId());
      setResize(null);
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once: true });
  }
  const size = () => resize() ?? { width: props.container().width, height: props.container().height };
  onCleanup(() => props.onDragPreview(null));
  return <NodeContainer nodeId={id} x={() => position().x} y={() => position().y}
    w={() => size().width} h={() => size().height}
    visualBand={() => 2 + 2 * props.depth()}>
    <div style={{
      position: 'absolute', inset: '0', overflow: 'hidden',
      border: '1px solid var(--theme-node-border)', 'border-radius': '8px',
      background: props.depth() % 2 === 0 ? 'var(--theme-container-bg-1)' : 'var(--theme-container-bg-2)', color: 'var(--fg)',
    }}>
      <div style={{
        position: 'relative', display: 'flex', height: '44px', 'align-items': 'center', padding: '0 12px',
        'justify-content': 'flex-end',
        background: `var(--theme-bg-${NODE_THEME_SLOT[props.head.type] ?? 1})`,
        'border-bottom': '1px solid var(--theme-node-border)',
        'user-select': 'none',
        'font-size': '12px', 'font-weight': '600', color: 'var(--fg-muted)',
      }}>
        <div data-container-drag-handle data-no-pan="true" onPointerDown={(event) => {
          event.stopPropagation(); drag.beginPress(id, event);
        }} style={{ position: 'absolute', inset: '0', cursor: 'grab' }} />
        <ToolbarSurface variant="node" class="absolute left-2 top-1 z-10" data-container-toolbar
          style={{ '--lui-node-toolbar-bg': `var(--theme-bg-${NODE_THEME_SLOT[props.head.type] ?? 1})` }}
          onPointerDown={(event) => event.stopPropagation()}>
          <div class="lui-node-toolbar__more">
            <span aria-hidden="true" class="lui-node-toolbar__expander"><Ellipsis size={ICON_SIZE} strokeWidth={1.7} /></span>
            <div class="lui-node-toolbar__actions">
              <IconButton aria-label="Create Node" title="Create Node" class="lui-node-toolbar__action" onClick={() => {
                void actions.createContainerNode(props.head.id, props.boardId()).then((result) => {
                  if (result.nodeId) props.onCreated(result.nodeId);
                });
              }}><Plus size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
            </div>
          </div>
        </ToolbarSurface>
        <span style={{ 'pointer-events': 'none', 'margin-left': 'auto', 'margin-right': '8px' }}>
          {containerHeaderLabel(props.head.text)}
        </span>
        <button type="button" aria-label="Container Membership" title="Container Membership"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenNodeVisibility('container', props.head.id, { x: event.clientX, y: event.clientY });
          }} class="denim-population-indicator" data-no-pan="true">{memberCounts().loaded}/{memberCounts().total}</button>
      </div>
      <div data-no-pan="true" aria-label="Resize Container" title="Resize Container"
        onPointerDown={beginResize}
        style={{ position: 'absolute', right: '1px', bottom: '1px', width: '16px', height: '16px', cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, var(--theme-node-border) 50%)' }} />
    </div>
  </NodeContainer>;
}

function containerHeaderLabel(ownerText: string): string {
  const owner = ownerText.slice(0, 16).trim();
  return owner ? `${owner} Container` : 'Container';
}

function NodeCard(props: {
  node: DenimNode;
  databaseGraph: () => DenimGraph;
  onOpenNodeVisibility: OpenNodeVisibility;
  selected: boolean;
  onOpenJourney: () => void;
  onDifferentiate: () => void;
  hasContainer: boolean;
  onSpawnContainer: () => void;
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
    'Journey', 'Action', 'Capability', 'Instance', 'Organization', 'Module', 'Contract', props.node.type,
  ])]);
  const downstreamCounts = () => {
    const all = props.databaseGraph();
    const loaded = new Set(session.state.graph.nodes.map((node) => node.id));
    const children = all.edges.filter((edge) => edge.type === 'parent-child' && edge.sourceId === props.node.id);
    return { loaded: children.filter((edge) => loaded.has(edge.targetId)).length, total: children.length };
  };
  return <article class="lui-node-card relative flex h-full flex-col gap-2 rounded-lg p-3 transition-shadow"
    style={{
      background: `var(--theme-bg-${NODE_THEME_SLOT[props.node.type] ?? 1})`,
      border: '1px solid var(--theme-node-border)',
      '--lui-node-toolbar-bg': `var(--theme-bg-${NODE_THEME_SLOT[props.node.type] ?? 1})`,
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
      onWheel={(event) => {
        const content = event.currentTarget;
        const canScrollVertically = content.scrollHeight > content.clientHeight + 1;
        const canScrollHorizontally = content.scrollWidth > content.clientWidth + 1;
        const canScrollY = event.deltaY < 0 ? content.scrollTop > 0
          : event.deltaY > 0 ? content.scrollTop + content.clientHeight < content.scrollHeight - 1 : false;
        const canScrollX = event.deltaX < 0 ? content.scrollLeft > 0
          : event.deltaX > 0 ? content.scrollLeft + content.clientWidth < content.scrollWidth - 1 : false;
        if ((canScrollVertically && canScrollY) || (canScrollHorizontally && canScrollX)) event.stopPropagation();
      }}
      onBlur={(event) => void actions.updateNode(props.node.id, { text: event.currentTarget.value })}
      class="min-h-0 flex-1 resize-none bg-transparent text-sm leading-5 text-fg outline-none focus-visible:ring-1 focus-visible:ring-accent/50" />
    <ToolbarSurface variant="node" class="absolute bottom-2 left-2" data-node-toolbar
      onPointerDown={(event) => event.stopPropagation()}>
      <Show when={props.node.type === 'Journey'}>
        <IconButton aria-label="Open Journey as a new Board" title="Open Journey as a new Board"
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
          <IconButton aria-label="Spawn Container" title={props.hasContainer ? 'This Node already has a Container on this Board' : 'Spawn Container'}
            class="lui-node-toolbar__action" disabled={props.hasContainer}
            onClick={(event) => { event.stopPropagation(); props.onSpawnContainer(); }}>
            <SquareDashed size={ICON_SIZE} strokeWidth={1.7} />
          </IconButton>
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
    <button type="button" class="denim-population-indicator denim-downstream-indicator" data-no-pan="true"
      aria-label="Downstream Nodes" title="Downstream Nodes"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        props.onOpenNodeVisibility('downstream', props.node.id, { x: event.clientX, y: event.clientY });
      }}>
      {downstreamCounts().loaded}/{downstreamCounts().total}
    </button>
  </article>;
}

function DenimAppToolbar(props: { onStatus: (message: string | null) => void }) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const [quickSelectOpen, setQuickSelectOpen] = createSignal(false);
  const [boardMenu, setBoardMenu] = createSignal<{ board: DenimBoard; anchor: HTMLElement } | null>(null);
  const [exportSubmenuOpen, setExportSubmenuOpen] = createSignal(false);
  const [overflow, setOverflow] = createSignal(false);
  const boardMenuRoots = new Set<HTMLElement>();
  let quickSelectButton: HTMLButtonElement | undefined;
  let strip: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshOverflow = () => setOverflow(Boolean(strip && strip.scrollWidth > strip.clientWidth + 1));
  const tabs = () => session.state.boards;
  const activate = (id: string) => {
    setBoardMenu(null);
    setExportSubmenuOpen(false);
    session.activateBoard(id);
    setQuickSelectOpen(false);
  };

  function showBoardMenu(board: DenimBoard, anchor: HTMLElement): void {
    setExportSubmenuOpen(false);
    setBoardMenu({ board, anchor });
  }

  async function exportBoard(board: DenimBoard): Promise<void> {
    setBoardMenu(null);
    setExportSubmenuOpen(false);
    try {
      const result = await actions.readBoard(board.id);
      if (!result.ok || !result.graph || !result.board) throw new Error(result.error ?? 'Could not read Board');
      const graph: DenimGraph = {
        nodes: result.graph.nodes,
        // Match the edges loaded into Denim's current Board projection.
        edges: result.graph.edges.filter((edge) => edge.type === 'parent-child'),
      };
      const parents = new Map<string, string>();
      for (const edge of graph.edges) if (!parents.has(edge.targetId)) parents.set(edge.targetId, edge.sourceId);
      const positions = dagLayout(graph.nodes.map((node): TidyNode => ({
        id: node.id, w: NODE_W, h: NODE_H, parentId: parents.get(node.id) ?? null,
      })), graph.edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId })));
      for (const [id, position] of Object.entries(result.board.positions)) positions.set(id, position);

      const document = denimBoardToExcalidraw(graph, positions);
      const filename = `${boardFilename(result.board.title)}.excalidraw`;
      const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }));
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      window.document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      props.onStatus(`Exported ${filename}`);
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => props.onStatus(null), 2400);
    } catch (cause) {
      props.onStatus(`Export failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => props.onStatus(null), 5000);
    }
  }

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
  onCleanup(() => {
    resizeObserver?.disconnect();
    clearTimeout(statusTimer);
  });

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
        <AnchoredMenu anchor={quickSelectButton} label="Boards" class="lui-menu-panel--wide" onClose={() => setQuickSelectOpen(false)}>
          <For each={tabs().filter((board) => board.kind === 'pinned')}>
            {(board) => <MenuItem onClick={() => activate(board.id)}>{board.title}</MenuItem>}
          </For>
        </AnchoredMenu>
      </Show>
    </div>
    <div class="lui-toolbar__tab-area">
      <Show when={overflow()}>
        <IconButton aria-label="Scroll tabs left" title="Scroll tabs left" class="lui-tab-scroll"
          onClick={() => strip?.scrollBy({ left: -180, behavior: 'smooth' })}><ChevronLeft size={16} /></IconButton>
      </Show>
      <div ref={strip} role="tablist" aria-label="Boards" class="lui-tab-strip"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            if (strip) strip.scrollLeft += event.deltaY;
          }
        }}>
        <For each={tabs()}>{(board, index) => <div class="lui-tab-item"
          aria-selected={session.state.activeBoardId === board.id}>
          <button type="button" role="tab" aria-selected={session.state.activeBoardId === board.id}
            tabIndex={session.state.activeBoardId === board.id ? 0 : -1} title={board.title} class="lui-tab"
            onClick={() => activate(board.id)} onKeyDown={(event) => tabKey(event, index())}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              showBoardMenu(board, event.currentTarget);
            }}>{board.title}</button>
          <Show when={board.kind === 'board'}>
            <IconButton aria-label={`Close ${board.title}`} title="Close Board" class="lui-tab-close"
              onClick={() => void actions.closeBoard(board.id)}><X size={13} /></IconButton>
          </Show>
        </div>}</For>
      </div>
      <Show when={overflow()}>
        <IconButton aria-label="Scroll tabs right" title="Scroll tabs right" class="lui-tab-scroll"
          onClick={() => strip?.scrollBy({ left: 180, behavior: 'smooth' })}><ChevronRight size={16} /></IconButton>
      </Show>
    </div>
    <Show when={boardMenu()}>{(menu) => <AnchoredMenu anchor={menu().anchor} label={`${menu().board.title} menu`}
      onClose={() => { setBoardMenu(null); setExportSubmenuOpen(false); }} relatedMenus={boardMenuRoots}>
      <MenuSubmenu label="Export" open={exportSubmenuOpen()} onOpen={() => setExportSubmenuOpen(true)}
        onClose={() => setExportSubmenuOpen(false)} relatedMenus={boardMenuRoots}
        trigger={<><span>Export</span><ChevronRight size={14} /></>}>
        <MenuItem onClick={() => void exportBoard(menu().board)}>Excalidraw</MenuItem>
      </MenuSubmenu>
    </AnchoredMenu>}</Show>
  </ToolbarSurface>;
}

function boardFilename(title: string): string {
  const safe = title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ');
  return safe || 'denim-board';
}

function DenimBoardCanvas(props: { onReload: () => void }) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const [picker, setPicker] = createSignal<PickerState | null>(null);
  const [visibilityMenu, setVisibilityMenu] = createSignal<VisibilityMenuState | null>(null);
  const [query, setQuery] = createSignal('');
  const [statusToast, setStatusToast] = createSignal<string | null>(null);
  const [edgeMenu, setEdgeMenu] = createSignal<{
    edgeId: string; x: number; y: number; canvasX: number; canvasY: number;
    kind: 'delete' | 'detach'; confirming?: boolean;
  } | null>(null);
  const activeBoard = () => session.state.boards.find((board) => board.id === session.state.activeBoardId)!;
  const isJourneysBoard = () => activeBoard().id === 'pinned:journeys';
  onMount(() => {
    if (import.meta.env.DEV) console.info('[Denim startup]', { phase: 'board canvas mounted' });
  });
  const results = createMemo(() => session.findNodesToConnect(query()));

  function openNodeVisibility(kind: VisibilityQueryKind, nodeId: string | undefined, position: { x: number; y: number }): void {
    const board = activeBoard();
    const title = kind === 'board' ? 'Add Node to Board' : kind === 'downstream' ? 'Downstream Nodes' : 'Container Membership';
    setPicker(null);
    setEdgeMenu(null);
    setVisibilityMenu({ kind, nodeId, boardId: board.id, boardTitle: board.title, title, ...position });
  }

  function openPicker(mode: PickerState['mode'], parentId: string | undefined, event: MouseEvent): void {
    setQuery('');
    setPicker({ mode, parentId, anchor: event.currentTarget as HTMLElement });
  }

  function chooseNode(node: DenimNode): void {
    const current = picker();
    if (!current) return;
    const task = current.mode === 'connect' && current.parentId
      ? actions.connectExisting(current.parentId, node.id)
      : actions.setNodeLoaded(node.id, true, activeBoard().id);
    void task;
    setPicker(null);
  }

  async function connectToNode(parentId: string | undefined, childId: string): Promise<void> {
    if (!parentId || parentId === childId) return;
    await actions.connectExisting(parentId, childId);
    setPicker(null);
  }

  function confirmDetachment(edgeId: string): void {
    const edge = session.state.graph.edges.find((candidate) => candidate.id === edgeId && candidate.type === 'contains');
    setEdgeMenu(null);
    if (edge) void actions.detachContainerNode(edge.sourceId, edge.targetId);
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
    <DenimAppToolbar onStatus={setStatusToast} />
    <div class="relative min-h-0 flex-1" onPointerDown={() => setEdgeMenu(null)}>
      <ToolbarSurface variant="floating" class="absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <Show when={isJourneysBoard()}>
          <IconButton aria-label="Add a Journey" title="Add a Journey"
            onClick={() => void actions.createJourney()}><Plus size={16} strokeWidth={1.8} /></IconButton>
        </Show>
        <IconButton aria-label="Add a node to this Board" title="Add a node to this Board"
          onClick={(event) => openPicker('include', undefined, event)}><Plus size={16} strokeWidth={1.8} /></IconButton>
      </ToolbarSurface>
      <GraphCanvas selectedId={() => session.state.selectedId} openPicker={openPicker}
        onStatus={setStatusToast}
        onOpenNodeVisibility={openNodeVisibility}
        onEdgeClick={(edgeId, x, y, canvasX, canvasY) => setEdgeMenu({ edgeId, x, y, canvasX, canvasY,
          kind: session.state.graph.edges.some((edge) => edge.id === edgeId && edge.type === 'contains') ? 'detach' : 'delete' })}
        onEdgeHover={(edgeId, x, y, canvasX, canvasY) => setEdgeMenu((current) => current?.edgeId === edgeId ? current
          : { edgeId, x, y, canvasX, canvasY, kind: 'detach' })}
        onViewportTransform={(camera) => setEdgeMenu((current) => current?.kind === 'detach'
          ? { ...current, x: camera.x + current.canvasX * camera.k, y: camera.y + current.canvasY * camera.k }
          : current)} />
      <div class="lui-feedback-tray pointer-events-none absolute bottom-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center justify-end gap-2">
        <DenimStatusToast message={statusToast} />
        <DenimSaveStatusBadge saving={() => session.state.saving} error={() => session.state.error} />
      </div>
    </div>
    <Show when={edgeMenu()}>
      {(menu) => <Portal>
        <Show when={menu().kind === 'detach'} fallback={<div class="lui-edge-delete-anchor" style={{ left: `${Math.max(8, Math.min(menu().x - 34, window.innerWidth - 120))}px`, top: `${Math.max(8, Math.min(menu().y + 8, window.innerHeight - 44))}px` }}>
          <Button aria-label="Delete edge" title="Delete edge" tone="danger" class="lui-edge-delete"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => { const edgeId = menu().edgeId; setEdgeMenu(null); void actions.deleteEdge(edgeId); }}>
            <Trash2 size={13} strokeWidth={1.8} /><span>Delete</span>
          </Button>
        </div>}>
          <div class="lui-detached-edge-anchor" classList={{ 'is-left': menu().x > window.innerWidth - 180 }}
            style={{ left: `${menu().x}px`, top: `${Math.max(18, Math.min(menu().y, window.innerHeight - 18))}px` }}>
            <span aria-hidden="true" class="lui-detached-edge-badge" />
            <ToolbarSurface variant="node" class="lui-detached-edge-tools" onPointerDown={(event) => event.stopPropagation()}>
              <Show when={menu().confirming} fallback={<IconButton aria-label="Detach Node" title="Detach Node" danger
                onClick={() => setEdgeMenu({ ...menu(), confirming: true })}>
                <Trash2 size={13} strokeWidth={1.8} />
              </IconButton>}>
                <Button aria-label="Confirm Detachment" title="Confirm Detachment" tone="danger" class="lui-edge-delete"
                  onClick={() => confirmDetachment(menu().edgeId)}>
                  <Trash2 size={13} strokeWidth={1.8} /><span>Confirm Detachment</span>
                </Button>
              </Show>
            </ToolbarSurface>
          </div>
        </Show>
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
    <Show when={visibilityMenu()}>{(menu) => <DenimNodeVisibilityMenu
      title={menu().title} boardTitle={menu().boardTitle} boardId={menu().boardId}
      position={{ x: menu().x, y: menu().y }}
      queryNodes={() => actions.queryNodes(menu().kind === 'board'
        ? { op: 'board.nodes.list', boardId: menu().boardId }
        : menu().kind === 'downstream'
          ? { op: 'node.downstream.list', boardId: menu().boardId, nodeId: menu().nodeId! }
          : { op: 'container.members.list', boardId: menu().boardId, containerNodeId: menu().nodeId! })}
      setNodeLoaded={(nodeId, loaded, boardId) => actions.setNodeLoaded(nodeId, loaded, boardId)}
      onClose={() => setVisibilityMenu(null)} />}</Show>
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
    <div ref={dialog} role="dialog" aria-label={props.mode === 'include' ? 'Add node to Board' : 'Choose node to connect'}
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
  const [startupStatus, setStartupStatus] = createSignal('Starting Denim…');
  const [error, setError] = createSignal<string | null>(null);
  const [creatingIn, setCreatingIn] = createSignal<CanvasSource | null>(null);
  const initialSrc = readParam('src');
  const startupStartedAt = performance.now();
  const startupRunId = Math.round(startupStartedAt);
  let startupStep = 0;
  let startupPhaseStartedAt = startupStartedAt;
  let startupPhaseName = 'Starting Denim';
  let startupPhaseMark = `denim:${startupRunId}:${startupStep}:starting-denim`;
  if (import.meta.env.DEV) performance.mark(startupPhaseMark);
  let stopWatching: (() => void) | undefined;

  function startupPhase(name: string, status: string): void {
    const now = performance.now();
    if (import.meta.env.DEV) {
      const endMark = `${startupPhaseMark}:end`;
      performance.mark(endMark);
      performance.measure(`denim:${startupRunId}:${startupPhaseName}`, startupPhaseMark, endMark);
      console.info('[Denim startup]', {
        completed: startupPhaseName,
        durationMs: Math.round(now - startupPhaseStartedAt),
        next: name,
        elapsedMs: Math.round(now - startupStartedAt),
      });
    }
    startupPhaseName = name;
    startupPhaseStartedAt = now;
    startupPhaseMark = `denim:${startupRunId}:${++startupStep}:${name}`;
    if (import.meta.env.DEV) performance.mark(startupPhaseMark);
    setStartupStatus(status);
  }

  function finishStartup(): void {
    const now = performance.now();
    if (import.meta.env.DEV) {
      const endMark = `${startupPhaseMark}:end`;
      performance.mark(endMark);
      performance.measure(`denim:${startupRunId}:${startupPhaseName}`, startupPhaseMark, endMark);
      console.info('[Denim startup]', {
        completed: startupPhaseName,
        durationMs: Math.round(now - startupPhaseStartedAt),
        totalMs: Math.round(now - startupStartedAt),
      });
    }
    setStartupStatus('');
  }

  async function openSource(item: CanvasSource): Promise<void> {
    setLoading(true);
    setError(null);
    let database: DenimDatabase | undefined;
    try {
      if (!item.loadBytes || !item.saveBytes) throw new Error('This source cannot read and save SQLite databases');
      startupPhase('database-bytes', 'Reading Denim database…');
      const loaded = await item.loadBytes();
      startupPhase('sqlite-init', 'Initializing SQLite…');
      database = await openDenimDatabase(loaded.bytes, `${import.meta.env.BASE_URL}sql-wasm-browser.wasm`);
      startupPhase('previous-session-dispose', 'Preparing Denim session…');
      const previous = session();
      stopWatching?.();
      stopWatching = undefined;
      if (previous) await previous.dispose();
      startupPhase('session-create', 'Preparing Denim Board…');
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
      startupPhase('file-watch-subscribe', 'Connecting to file updates…');
      if (!__STATIC__) {
        const openedSession = session()!;
        stopWatching = watchDocuments((changedPath, message) => {
          if (changedPath !== item.id || message?.revision === knownRevision || openedSession.state.dirty || openedSession.state.saving) return;
          void reloadSource().then(() => {
            if (message?.activateBoardId) session()?.activateBoard(message.activateBoardId);
          });
        });
      }
      writeParam('src', item.id);
      finishStartup();
    } catch (cause) {
      database?.close();
      setError(cause instanceof Error ? cause.message : String(cause));
      finishStartup();
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
      startupPhase('create-database', 'Creating Denim database…');
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
      finishStartup();
      setLoading(false);
    }
  }

  onMount(async () => {
    try {
      startupPhase('database-list', 'Finding Denim databases…');
      const list = await (__STATIC__ ? fetchStaticSources('.denim.sqlite') : fetchServerSources('.denim.sqlite'));
      setSources(list);
      const initial = initialSrc && list.find((item) => item.id === initialSrc);
      if (initial) await openSource(initial);
      else finishStartup();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      finishStartup();
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
      <Show when={!loading() ? session() : null} fallback={<Switch>
        <Match when={loading()}><div role="status" aria-live="polite" class="flex flex-1 items-center justify-center text-sm text-fg-muted">{startupStatus()}</div></Match>
        <Match when={!loading()}><DocumentPicker heading="Denim databases" sources={sources()} onSelect={(item) => void openSource(item)}
          createTitle="New project" onCreate={(item) => setCreatingIn(item)} /></Match>
      </Switch>}>
        {(active) => <DenimSessionContext.Provider value={active()}><DenimActionsProvider session={active()}><DenimBoardCanvas onReload={() => void reloadSource()} /></DenimActionsProvider></DenimSessionContext.Provider>}
      </Show>
    </div>
    <Show when={creatingIn()}>{(representative) => <NewProjectDialog root={representative().rootDir ?? representative().root}
      existingNames={sources().filter((item) => item.root === representative().root).map((item) => item.label)}
      onCancel={() => setCreatingIn(null)} onSubmit={(name) => void createProject(name)} />}</Show>
  </>;
}
