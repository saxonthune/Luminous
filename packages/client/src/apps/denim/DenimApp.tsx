import { sequenceDescendantEntries, type SequenceListEntry } from '@luminous/core/denim/sequence';
import { createEffect, createMemo, createSignal, For, Match, Show, Switch, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import ChevronLeft from 'lucide-solid/icons/chevron-left';
import ChevronRight from 'lucide-solid/icons/chevron-right';
import CirclePlus from 'lucide-solid/icons/circle-plus';
import Check from 'lucide-solid/icons/check';
import Ellipsis from 'lucide-solid/icons/ellipsis';
import ExternalLink from 'lucide-solid/icons/external-link';
import GitBranchPlus from 'lucide-solid/icons/git-branch-plus';
import GripHorizontal from 'lucide-solid/icons/grip-horizontal';
import Link2 from 'lucide-solid/icons/link-2';
import ListOrdered from 'lucide-solid/icons/list-ordered';
import ListTree from 'lucide-solid/icons/list-tree';
import Plus from 'lucide-solid/icons/plus';
import Pencil from 'lucide-solid/icons/pencil';
import SquareDashed from 'lucide-solid/icons/square-dashed';
import Trash2 from 'lucide-solid/icons/trash';
import Type from 'lucide-solid/icons/type';
import X from 'lucide-solid/icons/x';
import Menu from 'lucide-solid/icons/menu';
import FolderOpen from 'lucide-solid/icons/folder-open';
import { Canvas, NodeContainer, dagLayout, useCanvasContext, useGesture } from '@luminous/cactus';
import { directRectRoute } from '@luminous/cactus/layout';
import type { CanvasRef, EdgeDeclaration, TidyNode, Transform } from '@luminous/cactus';
import { exportDenimDatabase, hydrateDenimDatabase, openDenimDatabase, type DenimDatabase, type DenimGraph, type DenimNode, type DenimNodeType } from '@luminous/core/denim';
import { denimBoardToExcalidraw } from '@luminous/core/denim/excalidraw';
import { DENIM_DEFAULT_CONTAINER_GAP, DENIM_DEFAULT_CONTAINER_SIZE, DENIM_DEFAULT_NODE_SIZE } from '@luminous/core/denim/board';
import { DocumentPicker } from '../../DocumentPicker';
import { AnchoredMenu, Button, computeAnchoredPosition, IconButton, MenuItem, MenuSeparator, MenuSubmenu, Panel, ToolbarSurface } from '../../ui';
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
import { DenimNodeListRepresentation } from './DenimNodeListRepresentation';

const NODE_W: number = DENIM_DEFAULT_NODE_SIZE.width;
const NODE_H: number = DENIM_DEFAULT_NODE_SIZE.height;
const CONTAINER_W: number = DENIM_DEFAULT_CONTAINER_SIZE.width;
const CONTAINER_H: number = DENIM_DEFAULT_CONTAINER_SIZE.height;
const ICON_SIZE = 15;
const containerVisualId = (headNodeId: string) => `denim-container:${headNodeId}`;
type PickerState = { mode: 'include' | 'connect'; parentId?: string; anchor: HTMLElement };
type VisibilityQueryKind = 'board' | 'upstream' | 'downstream' | 'container';
type OpenNodeVisibility = (kind: VisibilityQueryKind, nodeId: string | undefined, position: { x: number; y: number }) => void;
type VisibilityMenuState = { kind: VisibilityQueryKind; nodeId?: string; boardId: string; boardTitle: string; title: string; x: number; y: number };

function stopWheelIfScrollable(event: WheelEvent & { currentTarget: HTMLElement }): void {
  const element = event.currentTarget;
  const canScrollVertically = element.scrollHeight > element.clientHeight + 1;
  const canScrollHorizontally = element.scrollWidth > element.clientWidth + 1;
  const canScrollY = event.deltaY < 0 ? element.scrollTop > 0
    : event.deltaY > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : false;
  const canScrollX = event.deltaX < 0 ? element.scrollLeft > 0
    : event.deltaX > 0 ? element.scrollLeft + element.clientWidth < element.scrollWidth - 1 : false;
  if ((canScrollVertically && canScrollY) || (canScrollHorizontally && canScrollX)) event.stopPropagation();
}

function stopCanvasZoomForOverflow(event: WheelEvent & { currentTarget: HTMLElement }): void {
  const element = event.currentTarget;
  const verticalOverflow = event.deltaY !== 0 && element.scrollHeight > element.clientHeight + 1;
  const horizontalOverflow = event.deltaX !== 0 && element.scrollWidth > element.clientWidth + 1;
  if (verticalOverflow || horizontalOverflow) event.stopPropagation();
}

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
  const hiddenSequenceNodeIds = createMemo(() => {
    const hidden = new Set<string>();
    const fullGraph = databaseGraph();
    for (const [ownerId, container] of Object.entries(activeBoard().containers)) {
      if (!container.sequenceContainerId || container.presentation === 'graph') continue;
      for (const entry of sequenceDescendantEntries(fullGraph, ownerId)) hidden.add(entry.node.id);
    }
    return hidden;
  });
  const previewModel = createMemo(() => previewDenimContainerDrag({
    model: baseCanvasModel(),
    preview: containerDragPreview(),
  }));
  const positions = createMemo(() => previewModel().positions);
  const nodeDepths = createMemo(() => previewModel().nodeDepths);
  const containerDepths = createMemo(() => previewModel().containerDepths);
  const edgeModel = createMemo(() => previewModel().edges);
  const canvasEdges = createMemo<EdgeDeclaration[]>(() => edgeModel()
    .filter((edge) => !hiddenSequenceNodeIds().has(edge.sourceId) && !hiddenSequenceNodeIds().has(edge.targetId))
    .map((edge) => {
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
  let boardContextPosition = { clientX: 0, clientY: 0, canvasX: 0, canvasY: 0 };
  let previousBoardId = activeBoard().id;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  async function spawnContainer(headNodeId: string): Promise<void> {
    const head = graph().nodes.find((node) => node.id === headNodeId);
    const position = positions().get(headNodeId);
    if (!head || !position) return;
    const boardId = activeBoard().id;
    const container: DenimBoardContainer = {
      x: position.x + NODE_W + DENIM_DEFAULT_CONTAINER_GAP,
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

  async function createOrLoadSequenceContainer(ownerNodeId: string): Promise<void> {
    const ownerPosition = positions().get(ownerNodeId);
    const owner = graph().nodes.find((node) => node.id === ownerNodeId);
    if (!owner || !ownerPosition) return;
    const entries = sequenceDescendantEntries(databaseGraph(), ownerNodeId);
    const descendantRects = entries.flatMap((entry) => {
      const position = positions().get(entry.node.id);
      return position ? [{ x: position.x, y: position.y, width: NODE_W, height: NODE_H }] : [];
    });
    const left = Math.min(...descendantRects.map((rect) => rect.x), ownerPosition.x + NODE_W + 72);
    const top = Math.min(...descendantRects.map((rect) => rect.y), ownerPosition.y);
    const right = Math.max(...descendantRects.map((rect) => rect.x + rect.width), left + 320);
    const bottom = Math.max(...descendantRects.map((rect) => rect.y + rect.height), top + 180);
    const container: DenimBoardContainer = {
      x: left - 24, y: top - 24,
      width: Math.max(320, right - left + 48),
      height: Math.max(200, bottom - top + 48),
    };
    clearTimeout(statusTimer);
    props.onStatus(`Loading Sequence Container for ${owner.text}…`);
    const result = await actions.createOrLoadSequenceContainer(ownerNodeId, container, activeBoard().id);
    if (!result.ok) {
      props.onStatus(`Could not load Sequence Container: ${result.error ?? 'unknown error'}`);
      statusTimer = setTimeout(() => props.onStatus(null), 5000);
      return;
    }
    props.onStatus(`Sequence Container loaded for ${owner.text}`);
    statusTimer = setTimeout(() => props.onStatus(null), 2400);
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
    const blurNodeLabelOnOutsidePointer = (event: PointerEvent) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLTextAreaElement) || !active.matches('[data-denim-node-label-editor]')) return;
      if (event.target instanceof Node && active.contains(event.target)) return;
      active.blur();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', blurNodeLabelOnOutsidePointer, true);
    onCleanup(() => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', blurNodeLabelOnOutsidePointer, true);
    });
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
        boardContextPosition = {
          clientX: position.clientX, clientY: position.clientY,
          canvasX: position.canvasX, canvasY: position.canvasY,
        };
        return { id: 'denim-board-context-menu', items: [
          { type: 'action', action: { id: 'denim.board.add-node', label: 'Add node' } },
          { type: 'submenu', label: 'Create new node', items: session.state.nodeTypes.map((nodeType) => ({
            type: 'action' as const,
            action: { id: 'denim.board.create-node', label: nodeType.name, payload: { nodeType: nodeType.name } },
          })) },
        ] };
      }}
      onAction={(id, payload) => {
        if (id === 'denim.board.add-node') {
          props.onOpenNodeVisibility('board', undefined, { x: boardContextPosition.clientX, y: boardContextPosition.clientY });
          return;
        }
        if (id === 'denim.board.create-node') {
          const nodeType = payload && typeof payload === 'object' ? (payload as { nodeType?: unknown }).nodeType : undefined;
          if (typeof nodeType !== 'string') return;
          void actions.createNode(nodeType, 'New node', {
            boardId: activeBoard().id,
            x: boardContextPosition.canvasX,
            y: boardContextPosition.canvasY,
          }).then((result) => {
            if (result.nodeId) canvasRef?.setSelectedIds([result.nodeId]);
          });
        }
      }}
      boxSelect={{ trigger: 'drag' }}
      onSelectionChange={(ids) => session.selectNode(ids.at(-1) ?? null)}
      freezeEdgeRouting={() => containerDragPreview() !== null}
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
        hiddenNodeIds={hiddenSequenceNodeIds}
        positions={positions}
        nodeDepths={nodeDepths}
        containerDepths={containerDepths}
        boardId={() => activeBoard().id}
        containers={() => activeBoard().containers}
        containerDragPreview={containerDragPreview}
        onContainerDragPreview={setContainerDragPreview}
        selectedId={props.selectedId}
        onSelect={session.selectNode}
        onSelectInCanvas={(id) => canvasRef?.setSelectedIds([id])}
        openPicker={props.openPicker}
        onSpawnContainer={spawnContainer}
        onCreateSequenceContainer={createOrLoadSequenceContainer}
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
  hiddenNodeIds: () => ReadonlySet<string>;
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
  onCreateSequenceContainer: (ownerNodeId: string) => Promise<void>;
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
    <For each={props.graph.nodes.filter((node) => !props.hiddenNodeIds().has(node.id))}>{(node) => {
    const basePosition = () => props.positions().get(node.id) ?? { x: 0, y: 0 };
    const pos = createMemo(() => {
      const offset = dragOffsets()[node.id];
      const base = basePosition();
      return offset ? { x: base.x + offset.dx, y: base.y + offset.dy } : base;
    });
    return <NodeContainer nodeId={node.id} x={() => pos().x} y={() => pos().y} w={() => NODE_W} h={() => NODE_H}
      allowOverflow
      visualBand={() => 2 + 2 * (props.nodeDepths().get(node.id) ?? 0)}
      onPointerDown={(event) => {
        ctx.onNodePointerDown(node.id, event);
        props.onSelect(node.id);
        if ((event.target as HTMLElement).closest('[data-denim-drag-handle]')) drag.beginPress(node.id, event);
      }}>
      <NodeCard node={node} onOpenJourney={() => void actions.openJourney(node.id)}
        databaseGraph={props.databaseGraph}
        onOpenNodeVisibility={props.onOpenNodeVisibility}
        onDifferentiate={() => void differentiateNode(node.id)}
        hasContainer={Boolean(props.containers()[node.id])}
        onSpawnContainer={() => void props.onSpawnContainer(node.id)}
        onCreateSequenceContainer={() => void props.onCreateSequenceContainer(node.id)}
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
  const sequenceEntries = createMemo(() => {
    session.state.graph;
    return sequenceDescendantEntries(props.databaseGraph(), props.head.id);
  });
  const isSequenceContainer = () => Boolean(props.container().sequenceContainerId);
  const sequencePresentation = () => props.container().presentation ?? 'special';
  const [sequenceEditingState, setSequenceEditingState] = createSignal<'default' | 'drafting'>('default');
  const [sequenceToolbarCollapsed, setSequenceToolbarCollapsed] = createSignal(false);
  const [offset, setOffset] = createSignal<{ x: number; y: number } | null>(null);
  const [resize, setResize] = createSignal<{ width: number; height: number } | null>(null);
  let carried: Record<string, { x: number; y: number }> = {};
  let carriedContainers: Record<string, { x: number; y: number }> = {};
  let dragRootIds: string[] = [];
  const drag = useGesture({
    zoomScale: () => ctx.transform().k,
    dragGroup: (nodeId) => ctx.isSelected(nodeId)
      ? ctx.selectedIds().filter((selectedId) => selectedId.startsWith('denim-container:'))
      : [nodeId],
    callbacks: {
      onDragStart: (_id, ids) => {
        const containers = props.containers();
        const roots = ids.map((id) => id.startsWith('denim-container:') ? id.slice('denim-container:'.length) : '')
          .filter((headId) => Boolean(containers[headId]));
        dragRootIds = roots.length > 0 ? [...new Set(roots)] : [props.head.id];
        const graph = props.databaseGraph();
        const parentByNode = new Map(graph.edges
          .filter((edge) => edge.type === 'contains')
          .map((edge) => [edge.targetId, edge.sourceId]));
        const movedContainerIds = new Set(dragRootIds);
        const pendingParents = [...dragRootIds];
        while (pendingParents.length > 0) {
          const parentHeadId = pendingParents.shift()!;
          const parentBox = containers[parentHeadId];
          if (!parentBox) continue;
          for (const [containerHeadId, nested] of Object.entries(containers)) {
            if (movedContainerIds.has(containerHeadId) || parentByNode.get(containerHeadId) !== parentHeadId) continue;
            const overlapsParentContent = nested.x < parentBox.x + parentBox.width
              && nested.x + nested.width > parentBox.x
              && nested.y < parentBox.y + parentBox.height
              && nested.y + nested.height > parentBox.y + 44;
            if (!overlapsParentContent) continue;
            movedContainerIds.add(containerHeadId);
            pendingParents.push(containerHeadId);
          }
        }
        carriedContainers = Object.fromEntries([...movedContainerIds]
          .filter((headId) => headId !== props.head.id)
          .flatMap((headId) => containers[headId] ? [[headId, { x: containers[headId].x, y: containers[headId].y }]] : []));
        const movingBoxes = [...movedContainerIds].flatMap((headId) => containers[headId] ? [containers[headId]] : []);
        carried = Object.fromEntries(props.nodes.flatMap((node) => {
          if (node.id === props.head.id) return [];
          const point = props.positions().get(node.id);
          if (!point) return [];
          const overlapsContent = movingBoxes.some((box) => point.x < box.x + box.width && point.x + NODE_W > box.x
            && point.y < box.y + box.height && point.y + NODE_H > box.y + 44);
          return overlapsContent ? [[node.id, point]] : [];
        }));
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
        dragRootIds = [];
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
      <div data-box-select-surface="true" style={{
        position: 'absolute', top: '44px', right: '0', bottom: '0', left: '0', 'pointer-events': 'none',
      }} />
      <div style={{
        position: 'relative', display: 'flex', height: '44px', 'align-items': 'center', padding: '0 12px',
        'justify-content': 'flex-end',
        background: `var(--theme-bg-${session.state.nodeTypes.find((type) => type.name === props.head.type)?.themeSlot ?? 1})`,
        'border-bottom': '1px solid var(--theme-node-border)',
        'user-select': 'none',
        'font-size': '12px', 'font-weight': '600', color: 'var(--fg-muted)',
      }}>
        <div data-container-drag-handle data-no-pan="true" onPointerDown={(event) => {
          event.stopPropagation();
          ctx.onNodePointerDown(id, event);
          drag.beginPress(id, event);
        }} style={{ position: 'absolute', inset: '0', cursor: 'grab' }} />
        <Show when={!isSequenceContainer()}>
          <ToolbarSurface variant="node" class="absolute left-2 top-1/2 -translate-y-1/2 z-10" data-container-toolbar
            style={{ '--lui-node-toolbar-bg': `var(--theme-bg-${session.state.nodeTypes.find((type) => type.name === props.head.type)?.themeSlot ?? 1})` }}
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
        </Show>
        <Show when={isSequenceContainer()}>
          <ToolbarSurface variant="node" class="denim-sequence-header-toolbar" data-sequence-container-toolbar data-no-pan="true"
            data-collapsed={sequenceToolbarCollapsed()}
            role="toolbar" aria-label="Sequence Container Toolbar"
            style={{ '--lui-node-toolbar-bg': 'var(--surface)' }}
            onPointerDown={(event) => event.stopPropagation()}
            onFocusIn={(event) => {
              if ((event.target as HTMLElement).matches(':focus-visible')) setSequenceToolbarCollapsed(false);
            }}
            onPointerEnter={() => setSequenceToolbarCollapsed(false)}
            onPointerLeave={() => setSequenceToolbarCollapsed(false)}>
                <IconButton aria-label={`Switch to ${sequencePresentation() === 'special' ? 'Graph' : 'Special'} Presentation`}
                  title={`Switch to ${sequencePresentation() === 'special' ? 'Graph' : 'Special'} Presentation`}
                  class="lui-node-toolbar__action" onClick={(event) => {
                    event.stopPropagation();
                    if (event.detail > 0) event.currentTarget.blur();
                    const next = sequencePresentation() === 'special' ? 'graph' : 'special';
                    void actions.setSequenceContainerPresentation(props.head.id, next, props.boardId());
                  }}>
                  {sequencePresentation() === 'special'
                    ? <SquareDashed size={ICON_SIZE} strokeWidth={1.7} />
                    : <ListOrdered size={ICON_SIZE} strokeWidth={1.7} />}
                </IconButton>
                <IconButton aria-label={`Switch to ${sequenceEditingState() === 'default' ? 'Drafting' : 'Default'} State`}
                  title={`Switch to ${sequenceEditingState() === 'default' ? 'Drafting' : 'Default'} State`}
                  class="lui-node-toolbar__action" onClick={async (event) => {
                    event.stopPropagation();
                    if (event.detail > 0) event.currentTarget.blur();
                    if (sequencePresentation() === 'graph') {
                      const result = await actions.setSequenceContainerPresentation(props.head.id, 'special', props.boardId());
                      if (!result.ok) return;
                    }
                    setSequenceEditingState((state) => state === 'default' ? 'drafting' : 'default');
                  }}>
                  {sequenceEditingState() === 'default'
                    ? <Pencil size={ICON_SIZE} strokeWidth={1.7} />
                    : <Check size={ICON_SIZE} strokeWidth={1.7} />}
                </IconButton>
                <Show when={sequencePresentation() === 'graph'}>
                  <div class="lui-node-toolbar__more" tabIndex={0} aria-label="More sequence container actions"
                    onPointerEnter={() => setSequenceToolbarCollapsed(false)}>
                    <span aria-hidden="true" class="lui-node-toolbar__expander"><Ellipsis size={ICON_SIZE} strokeWidth={1.7} /></span>
                    <div class="lui-node-toolbar__actions">
                  <IconButton aria-label="Layout sequence" title="Layout sequence" class="lui-node-toolbar__action"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.detail > 0) { event.currentTarget.blur(); setSequenceToolbarCollapsed(true); }
                      void actions.layoutSequence(props.head.id, props.boardId());
                    }}><ListTree size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
                  <IconButton aria-label="Create Node" title="Create Node" class="lui-node-toolbar__action" onClick={(event) => {
                    event.stopPropagation();
                    if (event.detail > 0) {
                      event.currentTarget.blur();
                      setSequenceToolbarCollapsed(true);
                    }
                    void actions.createContainerNode(props.head.id, props.boardId()).then((result) => {
                      if (result.nodeId) props.onCreated(result.nodeId);
                    });
                  }}><Plus size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
                    </div>
                  </div>
                </Show>
          </ToolbarSurface>
        </Show>
        <Show when={isSequenceContainer()} fallback={
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'pointer-events': 'none', 'margin-left': 'auto', 'margin-right': '8px', 'min-width': '0' }}>
            <span class="denim-sequence-header-title">{props.head.text.slice(0, 16).trim()}</span>
            <span class="denim-sequence-header-badge">Container</span>
          </div>
        }>
          <span class="denim-sequence-header-title">{props.head.text || '(untitled)'}</span>
          <span class="denim-sequence-header-badge">Sequence Container</span>
        </Show>
        <Show when={!isSequenceContainer()}>
          <button type="button" aria-label="Container Membership" title="Container Membership"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenNodeVisibility('container', props.head.id, { x: event.clientX, y: event.clientY });
            }} class="denim-population-indicator" data-no-pan="true">{memberCounts().loaded}/{memberCounts().total}</button>
        </Show>
      </div>
      <Show when={isSequenceContainer() && sequencePresentation() === 'special'}>
        <SequenceSpecialPresentation ownerNodeId={props.head.id} boardId={props.boardId}
          container={props.container} entries={sequenceEntries} nodeTypes={() => session.state.nodeTypes}
          editingState={sequenceEditingState()} />
      </Show>
      <div data-no-pan="true" aria-label="Resize Container" title="Resize Container"
        onPointerDown={beginResize}
        style={{ position: 'absolute', right: '1px', bottom: '1px', width: '16px', height: '16px', cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, var(--theme-node-border) 50%)' }} />
    </div>
  </NodeContainer>;
}

function SequenceSpecialPresentation(props: {
  ownerNodeId: string;
  boardId: () => string;
  container: () => DenimBoardContainer;
  entries: () => SequenceListEntry[];
  nodeTypes: () => DenimNodeType[];
  editingState: 'default' | 'drafting';
}) {
  const actions = useDenimActions();
  const [draggedId, setDraggedId] = createSignal<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = createSignal<string | null>(null);
  const editors = new Map<string, HTMLTextAreaElement>();

  createEffect(() => {
    const requestedId = pendingFocusId();
    if (!requestedId || !props.entries().some((entry) => entry.node.id === requestedId)) return;
    const frame = requestAnimationFrame(() => {
      const editor = editors.get(requestedId);
      if (!editor) return;
      editor.focus();
      setPendingFocusId(null);
    });
    onCleanup(() => cancelAnimationFrame(frame));
  });

  async function saveText(entry: SequenceListEntry, text: string): Promise<boolean> {
    if (text === entry.node.text) return true;
    return (await actions.updateNode(entry.node.id, { text })).ok;
  }

  async function createDraftSiblingAfter(entry: SequenceListEntry): Promise<void> {
    const container = props.container();
    const index = props.entries().length;
    const columns = Math.max(1, Math.floor((container.width - 24) / (NODE_W + 12)));
    const column = index % columns;
    const row = Math.floor(index / columns);
    const position = {
      x: container.x + 12 + column * (NODE_W + 12),
      y: container.y + 54 + row * (NODE_H + 12),
    };
    const height = Math.max(container.height, position.y - container.y + NODE_H + 12);
    if (height > container.height) {
      const resized = await actions.resizeContainer(props.ownerNodeId, { width: container.width, height }, props.boardId());
      if (!resized.ok) return;
    }
    const result = await actions.insertSequenceNodeAfter(props.ownerNodeId, entry.parentId, entry.node.id, position, props.boardId());
    if (result.ok && result.nodeId) setPendingFocusId(result.nodeId);
  }

  async function reparent(entry: SequenceListEntry, direction: 'indent' | 'outdent'): Promise<void> {
    const result = await actions.indentSequenceNode(props.ownerNodeId, entry.node.id, entry.parentId, direction);
    if (result.ok) setPendingFocusId(entry.node.id);
  }

  async function reorderBeforeOrAfter(event: DragEvent, target: SequenceListEntry): Promise<void> {
    event.preventDefault();
    const movingId = draggedId();
    const moving = props.entries().find((entry) => entry.node.id === movingId);
    if (!moving || moving.parentId !== target.parentId || moving.node.id === target.node.id) return;
    const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
    const placeBefore = bounds ? event.clientY < bounds.top + bounds.height / 2 : true;
    const result = await actions.moveSequenceNode(moving.node.id, moving.parentId, target.parentId,
      placeBefore ? { beforeNodeId: target.node.id } : { afterNodeId: target.node.id });
    if (result.ok) setPendingFocusId(moving.node.id);
    setDraggedId(null);
  }

  return <div data-no-pan="true" aria-label="Sequence Container Special Presentation"
    class={`denim-sequence-special-presentation${props.editingState === 'drafting' ? ' is-drafting' : ''}`}
    onWheel={stopCanvasZoomForOverflow}>
    <For each={props.entries()}>{(entry) => <div class="denim-sequence-list-row"
      style={{ 'margin-left': `${entry.depth * 16}px` }}
      draggable={props.editingState === 'default'}
      onDragStart={(event) => {
        if (props.editingState !== 'default') { event.preventDefault(); return; }
        setDraggedId(entry.node.id);
        event.dataTransfer?.setData('text/plain', entry.node.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        const moving = props.entries().find((candidate) => candidate.node.id === draggedId());
        if (moving && moving.parentId === entry.parentId && moving.node.id !== entry.node.id) event.preventDefault();
      }}
      onDrop={(event) => void reorderBeforeOrAfter(event, entry)}
      onDragEnd={() => setDraggedId(null)}>
      <Show when={props.editingState === 'drafting'}>
        <SequenceDraftingNodeToolbar nodeId={entry.node.id} depth={entry.depth} />
      </Show>
      <span class="denim-sequence-order-label">{entry.orderLabel}</span>
      <DenimNodeListRepresentation node={entry.node} nodeTypes={props.nodeTypes} class="denim-sequence-node-representation"
        typeContent={props.editingState === 'drafting' ? <select
          aria-label={`Change type for ${entry.node.text || 'untitled'}`}
          class="denim-sequence-type-label" value={entry.node.type}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const type = event.currentTarget.value;
            if (type !== entry.node.type) void actions.updateNode(entry.node.id, { type });
          }}>
          <For each={props.nodeTypes()}>{(type) => <option value={type.name}>{type.name}</option>}</For>
        </select> : undefined}
        textContent={props.editingState === 'drafting' ? <textarea ref={(element) => editors.set(entry.node.id, element)}
          data-sequence-node-editor={entry.node.id} aria-label={`Draft ${entry.node.type}: ${entry.node.text || 'untitled'}`}
          class="denim-sequence-list-editor" value={entry.node.text}
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={(event) => void saveText(entry, event.currentTarget.value)}
          onKeyDown={async (event) => {
            const value = event.currentTarget.value;
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.blur(); return; }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (await saveText(entry, value)) await createDraftSiblingAfter(entry);
              return;
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              if (await saveText(entry, value)) await reparent(entry, event.shiftKey ? 'outdent' : 'indent');
            }
          }} /> : undefined}
        trailing={props.editingState === 'default' ? <select aria-label={`Change type for ${entry.node.text || 'untitled'}`}
          class="denim-sequence-type-select" value={entry.node.type}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => { const type = event.currentTarget.value; if (type !== entry.node.type) void actions.updateNode(entry.node.id, { type }); }}>
          <For each={props.nodeTypes()}>{(type) => <option value={type.name}>{type.name}</option>}</For>
        </select> : undefined} />
    </div>}</For>
  </div>;
}

function SequenceDraftingNodeToolbar(props: { nodeId: string; depth: number }) {
  return <ToolbarSurface variant="node" class="denim-sequence-drafting-node-toolbar" data-no-pan="true"
    style={{ left: `${-28 - props.depth * 16}px` }}
    role="toolbar" aria-label="Sequence Container Drafting Mode Node Toolbar"
    onPointerDown={(event) => event.stopPropagation()}>
    <NodeDeleteControl nodeId={props.nodeId} />
  </ToolbarSurface>;
}

function NodeDeleteControl(props: { nodeId: string }) {
  const actions = useDenimActions();
  const [open, setOpen] = createSignal(false);
  const [deleteSubmenu, setDeleteSubmenu] = createSignal<'single' | 'children' | null>(null);
  const relatedMenus = new Set<HTMLElement>();
  let button: HTMLButtonElement | undefined;
  function close(): void {
    setOpen(false);
    setDeleteSubmenu(null);
  }
  return <div class="lui-node-toolbar__menu-anchor">
    <IconButton ref={button} aria-label="Delete node" title="Delete node" danger class="lui-node-toolbar__action"
      aria-expanded={open()} onClick={(event) => {
        event.stopPropagation();
        setOpen((current) => {
          const next = !current;
          if (!next) setDeleteSubmenu(null);
          return next;
        });
      }}><Trash2 size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
    <Show when={open()}>
      <AnchoredMenu anchor={button} label="Delete node" relatedMenus={relatedMenus} onClose={close}>
        <MenuSubmenu label="Confirm deleting node" open={deleteSubmenu() === 'single'}
          onOpen={() => setDeleteSubmenu('single')} onClose={() => setDeleteSubmenu(null)} relatedMenus={relatedMenus}
          trigger={<><span>Delete Node</span><ChevronRight size={14} /></>}>
          <MenuItem danger onClick={() => { close(); void actions.deleteNode(props.nodeId, 'node'); }}>Confirm</MenuItem>
        </MenuSubmenu>
        <MenuSubmenu label="Confirm deleting node and children" open={deleteSubmenu() === 'children'}
          onOpen={() => setDeleteSubmenu('children')} onClose={() => setDeleteSubmenu(null)} relatedMenus={relatedMenus}
          trigger={<><span>Delete Node and Children</span><ChevronRight size={14} /></>}>
          <MenuItem danger onClick={() => { close(); void actions.deleteNode(props.nodeId, 'subtree'); }}>Confirm</MenuItem>
        </MenuSubmenu>
      </AnchoredMenu>
    </Show>
  </div>;
}

function NodeCard(props: {
  node: DenimNode;
  databaseGraph: () => DenimGraph;
  onOpenNodeVisibility: OpenNodeVisibility;
  onOpenJourney: () => void;
  onDifferentiate: () => void;
  hasContainer: boolean;
  onSpawnContainer: () => void;
  onCreateSequenceContainer: () => void;
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
  const [openNodeMenu, setOpenNodeMenu] = createSignal<'type' | 'sequence' | null>(null);
  const [editingText, setEditingText] = createSignal(false);
  const [draftText, setDraftText] = createSignal(props.node.text);
  let textInput: HTMLTextAreaElement | undefined;
  let sequenceOptionsButton: HTMLButtonElement | undefined;
  let typeChangeButton: HTMLButtonElement | undefined;
  const types = createMemo(() => [...new Set([...session.state.nodeTypes.map((type) => type.name), props.node.type])]);
  function beginTextEdit(): void {
    setDraftText(props.node.text);
    setEditingText(true);
    queueMicrotask(() => {
      textInput?.focus();
      textInput?.setSelectionRange(textInput.value.length, textInput.value.length);
    });
  }
  function commitTextEdit(event: FocusEvent & { currentTarget: HTMLTextAreaElement }): void {
    const text = event.currentTarget.value;
    setEditingText(false);
    if (text !== props.node.text) void actions.updateNode(props.node.id, { text });
  }
  const downstreamCounts = () => {
    const all = props.databaseGraph();
    const loaded = new Set(session.state.graph.nodes.map((node) => node.id));
    const children = all.edges.filter((edge) => edge.type === 'parent-child' && edge.sourceId === props.node.id);
    return { loaded: children.filter((edge) => loaded.has(edge.targetId)).length, total: children.length };
  };
  const upstreamCounts = () => {
    const all = props.databaseGraph();
    const loaded = new Set(session.state.graph.nodes.map((node) => node.id));
    const parents = all.edges.filter((edge) => edge.type === 'parent-child' && edge.targetId === props.node.id);
    return { loaded: parents.filter((edge) => loaded.has(edge.sourceId)).length, total: parents.length };
  };
  return <article class="lui-node-card relative flex h-full flex-col gap-2 rounded-lg px-3 pt-3 pb-1 transition-shadow"
    style={{
      background: `var(--theme-bg-${session.state.nodeTypes.find((type) => type.name === props.node.type)?.themeSlot ?? 1})`,
      border: '1px solid var(--theme-node-border)',
    }}>
    <div data-denim-drag-handle data-no-pan="true" aria-hidden="true"
      class="absolute inset-x-0 top-0 z-10 h-3 cursor-grab active:cursor-grabbing" />
    <div class="flex h-6 w-full shrink-0 items-center justify-end">
      <div data-denim-drag-handle data-no-pan="true" aria-label="Drag node" title="Drag node"
        class="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted active:cursor-grabbing">
        <GripHorizontal size={ICON_SIZE} strokeWidth={1.8} />
      </div>
    </div>
    <Show when={editingText()} fallback={
      <div role="button" tabIndex={0} aria-label="Edit node text"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); beginTextEdit(); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginTextEdit(); }
        }}
        onWheel={stopWheelIfScrollable}
        class="denim-node-text-display min-h-0 flex-1 overflow-auto text-sm leading-5 text-fg">{props.node.text}</div>
    }>
      <textarea ref={textInput} data-denim-node-label-editor aria-label="Node text" value={draftText()}
        onPointerDown={(event) => event.stopPropagation()}
        onInput={(event) => setDraftText(event.currentTarget.value)}
        onWheel={stopWheelIfScrollable}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
        }}
        onBlur={commitTextEdit}
        class="min-h-0 flex-1 resize-none bg-transparent text-sm leading-5 text-fg outline-none focus-visible:ring-1 focus-visible:ring-accent/50" />
    </Show>
    <div class="denim-node-status-bar">
      <span class="denim-node-type-label">{props.node.type}</span>
      <div class="denim-node-status-indicators">
        <button type="button" class="denim-population-indicator denim-node-status-indicator" data-no-pan="true"
          aria-label="Upstream Nodes" title="Upstream Nodes"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenNodeVisibility('upstream', props.node.id, { x: event.clientX, y: event.clientY });
          }}>{upstreamCounts().loaded}/{upstreamCounts().total}</button>
        <button type="button" class="denim-population-indicator denim-node-status-indicator" data-no-pan="true"
          aria-label="Downstream Nodes" title="Downstream Nodes"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenNodeVisibility('downstream', props.node.id, { x: event.clientX, y: event.clientY });
          }}>{downstreamCounts().loaded}/{downstreamCounts().total}</button>
      </div>
    <ToolbarSurface variant="node" class="absolute left-0 top-1/2 -translate-y-1/2" data-node-toolbar
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
          <div class="lui-node-toolbar__menu-anchor">
            <IconButton ref={typeChangeButton} aria-label="Change node type" title="Change node type" class="lui-node-toolbar__action"
              aria-expanded={openNodeMenu() === 'type'} onClick={(event) => {
                event.stopPropagation();
                setOpenNodeMenu((current) => current === 'type' ? null : 'type');
              }}><Type size={ICON_SIZE} strokeWidth={1.7} /></IconButton>
            <Show when={openNodeMenu() === 'type'}>
              <AnchoredMenu anchor={typeChangeButton} label="Change node type"
                onClose={() => setOpenNodeMenu(null)}>
                <For each={types()}>{(type) => <MenuItem selected={type === props.node.type} onClick={() => {
                  setOpenNodeMenu(null);
                  if (type !== props.node.type) void actions.updateNode(props.node.id, { type });
                }}>{type}</MenuItem>}</For>
                <MenuSeparator />
                <MenuItem onClick={() => {
                  setOpenNodeMenu(null);
                  const custom = window.prompt('Type name', props.node.type);
                  if (custom?.trim()) void actions.updateNode(props.node.id, { type: custom.trim() });
                }}>Other…</MenuItem>
              </AnchoredMenu>
            </Show>
          </div>
          <IconButton aria-label="Spawn Container" title={props.hasContainer ? 'This Node already has a Container on this Board' : 'Spawn Container'}
            class="lui-node-toolbar__action" disabled={props.hasContainer}
            onClick={(event) => { event.stopPropagation(); props.onSpawnContainer(); }}>
            <SquareDashed size={ICON_SIZE} strokeWidth={1.7} />
          </IconButton>
          <IconButton aria-label="Create or load Sequence Container" title="Create or load Sequence Container on this Board"
            class="lui-node-toolbar__action" onClick={(event) => { event.stopPropagation(); props.onCreateSequenceContainer(); }}>
            <ListTree size={ICON_SIZE} strokeWidth={1.7} />
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
          <NodeDeleteControl nodeId={props.node.id} />
        </div>
      </div>
    </ToolbarSurface>
    </div>
  </article>;
}

function DenimAppToolbar(props: {
  onStatus: (message: string | null) => void;
  onOpenTypes: () => void;
  onOpenBoards: () => void;
  typesOpen: boolean;
  typesActive: boolean;
  onCloseTypes: () => void;
}) {
  const session = useDenimSession();
  const actions = useDenimActions();
  const [quickSelectOpen, setQuickSelectOpen] = createSignal(false);
  const [journeyPickerOpen, setJourneyPickerOpen] = createSignal(false);
  const [openingJourney, setOpeningJourney] = createSignal(false);
  let journeyButton: HTMLButtonElement | undefined;
  const [boardMenu, setBoardMenu] = createSignal<{ board: DenimBoard; anchor: HTMLElement } | null>(null);
  const [exportSubmenuOpen, setExportSubmenuOpen] = createSignal(false);
  const [overflow, setOverflow] = createSignal(false);
  const boardMenuRoots = new Set<HTMLElement>();
  let quickSelectButton: HTMLButtonElement | undefined;
  let strip: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const refreshOverflow = () => setOverflow(Boolean(strip && strip.scrollWidth > strip.clientWidth + 1));
  const tabs = () => session.state.boards.filter((board) => board.kind !== 'pinned');
  const journeys = () => session.databaseGraph().nodes.filter((node) => node.type === 'Journey');
  async function openSelectedJourney(id: string) {
    if (openingJourney()) return;
    setOpeningJourney(true);
    try {
      const result = await actions.openJourney(id);
      if (result.ok) { setJourneyPickerOpen(false); props.onOpenBoards(); }
      else props.onStatus(result.error ?? 'Could not open Journey');
    } finally { setOpeningJourney(false); }
  }
  const activate = (id: string) => {
    setBoardMenu(null);
    setExportSubmenuOpen(false);
    session.activateBoard(id);
    props.onOpenBoards();
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

      const document = denimBoardToExcalidraw(graph, positions, session.state.nodeTypes);
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

  async function createNewBoard(): Promise<void> {
    setQuickSelectOpen(false);
    const result = await actions.createBoard();
    clearTimeout(statusTimer);
    if (!result.ok) {
      props.onStatus(`Could not create Board: ${result.error ?? 'unknown error'}`);
      statusTimer = setTimeout(() => props.onStatus(null), 5000);
      return;
    }
    props.onOpenBoards();
    props.onStatus('Created New Board');
    statusTimer = setTimeout(() => props.onStatus(null), 2400);
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
    props.typesOpen;
    queueMicrotask(refreshOverflow);
  });
  onCleanup(() => {
    resizeObserver?.disconnect();
    clearTimeout(statusTimer);
  });

  function tabKey(event: KeyboardEvent, index: number): void {
    const count = tabs().length + Number(props.typesOpen);
    const to = event.key === 'ArrowRight' ? Math.min(index + 1, count - 1)
      : event.key === 'ArrowLeft' ? Math.max(index - 1, 0)
        : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
    if (to < 0) return;
    event.preventDefault();
    const next = tabs()[to];
    if (next) activate(next.id);
    else props.onOpenTypes();
    strip?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus();
  }

  return <ToolbarSurface variant="app" class="relative">
    <div class="lui-toolbar__section">
      <IconButton ref={quickSelectButton} aria-label="Quick Select" title="Quick Select" aria-expanded={quickSelectOpen()}
        onClick={() => { setJourneyPickerOpen(false); setQuickSelectOpen((open) => !open); }}><Menu size={17} strokeWidth={1.8} /></IconButton>
      <Show when={quickSelectOpen()}>
        <AnchoredMenu anchor={quickSelectButton} label="Quick Select" class="lui-menu-panel--wide" onClose={() => setQuickSelectOpen(false)}>
          <MenuItem onClick={() => void createNewBoard()}>New Board</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => { props.onOpenTypes(); setQuickSelectOpen(false); }}>Types</MenuItem>
        </AnchoredMenu>
      </Show>
      <IconButton ref={journeyButton} aria-label="Open User Journey" title="Open User Journey"
        aria-expanded={journeyPickerOpen()} onClick={() => { setQuickSelectOpen(false); setJourneyPickerOpen((open) => !open); }}>
        <FolderOpen size={17} strokeWidth={1.8} />
      </IconButton>
      <Show when={journeyPickerOpen()}>
        <AnchoredMenu anchor={journeyButton} label="Open User Journey" class="lui-menu-panel--wide" onClose={() => setJourneyPickerOpen(false)}>
          <div style={{ padding: '8px' }}>Open User Journey</div>
          <div style={{ 'max-height': '60vh', 'overflow-y': 'auto' }}>
            <For each={journeys()} fallback={<div style={{ padding: '8px' }}>No journeys yet.</div>}>
              {(journey) => <MenuItem disabled={openingJourney()} onClick={() => void openSelectedJourney(journey.id)}>
                <DenimNodeListRepresentation node={journey} nodeTypes={() => session.state.nodeTypes} />
              </MenuItem>}
            </For>
          </div>
        </AnchoredMenu>
      </Show>
    </div>
    <div class="lui-toolbar__tab-area">
      <Show when={overflow()}>
        <IconButton aria-label="Scroll tabs left" title="Scroll tabs left" class="lui-tab-scroll"
          onClick={() => strip?.scrollBy({ left: -180, behavior: 'smooth' })}><ChevronLeft size={16} /></IconButton>
      </Show>
      <div ref={strip} role="tablist" aria-label="Denim tabs" class="lui-tab-strip"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            if (strip) strip.scrollLeft += event.deltaY;
          }
        }}>
        <For each={tabs()}>{(board, index) => <div class="lui-tab-item"
          aria-selected={!props.typesActive && session.state.activeBoardId === board.id}>
          <button type="button" role="tab" aria-selected={!props.typesActive && session.state.activeBoardId === board.id}
            tabIndex={!props.typesActive && session.state.activeBoardId === board.id ? 0 : -1} title={board.title} class="lui-tab"
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
        <Show when={props.typesOpen}>
          <div class="lui-tab-item" aria-selected={props.typesActive}>
            <button type="button" role="tab" aria-selected={props.typesActive}
              tabIndex={props.typesActive ? 0 : -1} class="lui-tab" title="Types"
              onClick={props.onOpenTypes} onKeyDown={(event) => tabKey(event, tabs().length)}>Types</button>
            <IconButton aria-label="Close Types" title="Close Types" class="lui-tab-close"
              onClick={props.onCloseTypes}><X size={13} /></IconButton>
          </div>
        </Show>
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
  const [page, setPage] = createSignal<'board' | 'types'>('board');
  const [typesOpen, setTypesOpen] = createSignal(false);
  const [edgeMenu, setEdgeMenu] = createSignal<{
    edgeId: string; x: number; y: number; canvasX: number; canvasY: number;
    kind: 'delete' | 'detach'; confirming?: boolean;
  } | null>(null);
  const activeBoard = () => session.state.boards.find((board) => board.id === session.state.activeBoardId)!;

  onMount(() => {
    if (import.meta.env.DEV) console.info('[Denim startup]', { phase: 'board canvas mounted' });
  });
  const results = createMemo(() => session.findNodesToConnect(query()));

  function openNodeVisibility(kind: VisibilityQueryKind, nodeId: string | undefined, position: { x: number; y: number }): void {
    const board = activeBoard();
    const title = kind === 'board' ? 'Add Node to Board'
      : kind === 'upstream' ? 'Upstream Nodes'
        : kind === 'downstream' ? 'Downstream Nodes' : 'Container Membership';
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
    <DenimAppToolbar onStatus={setStatusToast}
      typesOpen={typesOpen()} typesActive={page() === 'types'}
      onOpenTypes={() => { setTypesOpen(true); setPage('types'); }}
      onCloseTypes={() => { setTypesOpen(false); if (page() === 'types') setPage('board'); }}
      onOpenBoards={() => setPage('board')} />
    <Show when={page() === 'types'} fallback={<Show when={activeBoard().kind !== 'pinned'} fallback={<div class="flex flex-1 items-center justify-center">Open a User Journey or create a New Board.</div>}><>
    <div class="relative min-h-0 flex-1" onPointerDown={() => setEdgeMenu(null)}>
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
        query={query} setQuery={setQuery} results={results} nodeTypes={() => session.state.nodeTypes}
        targetForId={(id) => session.state.graph.nodes.find((node) => node.id === id)}
        isValidTarget={(id) => Boolean(current().parentId && session.canConnectExisting(current().parentId!, id))}
        onChoose={chooseNode} onConnect={connectToNode} onClose={() => { setPicker(null); setStatusToast(null); }}
        onStatus={setStatusToast} />}
    </Show>
    <Show when={visibilityMenu()}>{(menu) => <DenimNodeVisibilityMenu
      title={menu().title} boardTitle={menu().boardTitle} boardId={menu().boardId}
      position={{ x: menu().x, y: menu().y }}
      nodeTypes={() => session.state.nodeTypes}
      queryNodes={() => actions.queryNodes(menu().kind === 'board'
        ? { op: 'board.nodes.list', boardId: menu().boardId }
      : menu().kind === 'upstream'
        ? { op: 'node.upstream.list', boardId: menu().boardId, nodeId: menu().nodeId! }
        : menu().kind === 'downstream'
          ? { op: 'node.downstream.list', boardId: menu().boardId, nodeId: menu().nodeId! }
          : { op: 'container.members.list', boardId: menu().boardId, containerNodeId: menu().nodeId! })}
      setNodeLoaded={(nodeId, loaded, boardId) => actions.setNodeLoaded(nodeId, loaded, boardId)}
      onClose={() => setVisibilityMenu(null)} />}</Show>
    </></Show>}>
      <DenimTypesPage />
    </Show>
  </div>;
}

function DenimTypesPage() {
  const session = useDenimSession();
  const actions = useDenimActions();
  const [creating, setCreating] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  let newTypeInput: HTMLInputElement | undefined;

  async function createType(): Promise<void> {
    const name = newName().trim();
    if (!name) { setCreating(false); return; }
    const result = await actions.createNodeType(name);
    if (result.ok) { setCreating(false); setNewName(''); }
  }

  return <main class="denim-types-page" aria-label="Types">
    <Panel title="Types" class="denim-types-panel">
    <div class="denim-types-page__list" role="list" aria-label="Node types">
      <For each={session.state.nodeTypes}>{(type) => <DenimTypeItem type={type}
        onRename={(name) => actions.renameNodeType(type.id, name)}
        onColor={(slot) => actions.setNodeTypeColor(type.id, slot)} />}</For>
      <Show when={creating()}>
        <input ref={newTypeInput} class="denim-types-page__item" aria-label="New node type name"
          value={newName()} onInput={(event) => setNewName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void createType(); }
            if (event.key === 'Escape') { setCreating(false); setNewName(''); }
          }} onBlur={() => void createType()} />
      </Show>
      <IconButton aria-label="Create type" title="Create type" onClick={() => {
        setNewName(''); setCreating(true); queueMicrotask(() => newTypeInput?.focus());
      }}><Plus size={16} strokeWidth={1.8} /></IconButton>
    </div>
    </Panel>
  </main>;
}

function DenimTypeItem(props: { type: DenimNodeType; onColor: (slot: number) => Promise<{ ok: boolean; error?: string }>; onRename: (name: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [error, setError] = createSignal('');
  const [name, setName] = createSignal(props.type.name);
  createEffect(() => setName(props.type.name));
  async function save(): Promise<void> {
    const next = name().trim();
    if (!next || next === props.type.name || next === 'Journey') { setName(props.type.name); return; }
    const result = await props.onRename(next);
    if (!result.ok) setName(props.type.name);
  }
  return <div class="denim-types-page__row" role="listitem">
    <div class="denim-types-page__fields">
    <input class="denim-types-page__item" aria-label={`Node type: ${props.type.name}`}
    value={name()} readOnly={props.type.name === 'Journey'}
    onInput={(event) => setName(event.currentTarget.value)}
    onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { setName(props.type.name); event.currentTarget.blur(); }
    }} onBlur={() => void save()} />
    <select class="denim-types-page__color" aria-label={`Color for ${props.type.name}`}
      style={{ background: `var(--theme-bg-${props.type.themeSlot})` }} value={props.type.themeSlot}
      onChange={async (event) => {
        const element = event.currentTarget;
        const result = await props.onColor(Number(element.value));
        setError(result.ok ? '' : result.error ?? 'Could not save color');
        if (!result.ok) element.value = String(props.type.themeSlot);
      }}>
      <For each={['Slate', 'Moss', 'Deep moss', 'Ochre', 'Violet', 'Indigo', 'Oxide', 'Rose']}>
        {(label, index) => <option value={index() + 1}>{label}</option>}
      </For>
    </select>
    </div>
    <Show when={error()}><span role="alert">{error()}</span></Show>
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
  nodeTypes: () => DenimNodeType[];
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
          <For each={props.results()}>{(node) => <button type="button" class="denim-find-node-picker__option"
            onClick={() => props.onChoose(node)}>
            <DenimNodeListRepresentation node={node} nodeTypes={props.nodeTypes} />
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
