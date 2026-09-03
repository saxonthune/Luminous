import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type JSX } from 'solid-js';
import type { MerinoAction, MerinoColorToken, MerinoDocument, MerinoPortPosition, MerinoPorts, MerinoTab } from '@luminous/core/merino';
import { MERINO_TABS, applyMerinoBatch, cloneNode, descendantIds } from '@luminous/core/merino';
import { BoundaryHandle, Canvas, ConnectionPreview, CounterScaleSlot, NodeContainer, ResizeHandle, SplitMenuButton, isOverContainerInterior, useCanvasContext, useGesture } from '@luminous/cactus';
import type { CanvasRef, Transform, VisualLodDeclaration, VisualLodSize } from '@luminous/cactus';
import { CONTAINER_PADDING, DEFAULT_ENTRY_PORT, DEFAULT_EXIT_PORT, LIST_GAP, NODE_HEADER_HEIGHT, NODE_HEIGHT, NODE_WIDTH, childAreaOrigin, findContainerAtPoint, growOnlyContainerActions, listInsertionIndex, merinoPortDimensions, nodeHeight, nodeTypeById, projectMerino, tokenVar, type MerinoRenderNode } from './projection.ts';
import { downstreamMenuItems, downstreamNodes, nodeContextMenu, backgroundContextMenu, edgeContextMenu, type MerinoMenuDeps } from './menus.tsx';
import { ManageTypesPanel } from './ManageTypesPanel.tsx';
import { copyMerinoSelection, pasteMerinoSelection, type MerinoClipboard } from './clipboard.ts';
import { buildFlowLayoutActions, buildRemoveOverlapActions } from './tidy.ts';
import { transientViewportOptions } from '../../canvas-tools/transientViewport.ts';
import { MERINO_OVERVIEW_ZOOM, MERINO_STRUCTURAL_ZOOM, merinoSecondaryContentVisible } from './semanticZoom.ts';
import { MERINO_OVERVIEW_ROOT_IDS, MerinoOverview, initialCards, reconcileMerinoOverviewRoots } from './MerinoOverview.tsx';
import type { MerinoOverviewDisclosureState, MerinoOverviewZoom } from './MerinoOverview.tsx';
import { MERINO_VIEWS, isMerinoOverviewDisclosureState, readMerinoViewState, writeMerinoViewState, type MerinoView } from './viewState.ts';

const EDGE_TAB_SIZE = 18;
/** Below this camera scale, names move into a screen-readable overview layer. */
const TITLE_OVERVIEW_START_ZOOM = MERINO_OVERVIEW_ZOOM;
const TITLE_OVERVIEW_FULL_ZOOM = 0.25;
const TITLE_SCREEN_FONT_SIZE = 12;
const TITLE_OUTERMOST_BONUS = 6;
const TITLE_OVERVIEW_MAX_WIDTH = 220;
const TITLE_OVERVIEW_MAX_DISPLACEMENT = 72;
const IDENTITY_MIN_SCREEN_WIDTH = 48;
const IDENTITY_MIN_SCREEN_HEIGHT = 24;
const CONTROL_MIN_SCREEN_HEIGHT = 16;
const SLOT_HYSTERESIS = 2;

/** A smooth 0→1 blend as the camera moves from the close view to overview. */
function overviewProgress(zoom: number): number {
  const raw = Math.max(0, Math.min(1,
    (TITLE_OVERVIEW_START_ZOOM - zoom) / (TITLE_OVERVIEW_START_ZOOM - TITLE_OVERVIEW_FULL_ZOOM),
  ));
  return raw * raw * (3 - 2 * raw);
}

function overviewTitleSize(depth: number, maxDepth: number, zoom: number): number {
  const hierarchy = maxDepth === 0 ? 0 : (maxDepth - depth) / maxDepth;
  return TITLE_SCREEN_FONT_SIZE + overviewProgress(zoom) * hierarchy * TITLE_OUTERMOST_BONUS;
}

/** Fast, deliberately conservative text-width estimate in screen pixels. The
 * exact DOM size reconciles after zoom settles; this keeps camera motion free
 * of synchronous layout reads. */
function estimatedTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    if (/[ilI1 .'`]/.test(char)) em += 0.32;
    else if (/[MW@#%]/.test(char)) em += 0.9;
    else if (/[A-Z0-9]/.test(char)) em += 0.68;
    else em += 0.56;
  }
  return em * fontSize;
}

function estimatedOverviewIdentitySize(
  name: string,
  typeName: string,
  depth: number,
  maxDepth: number,
  zoom: number,
): VisualLodSize {
  const titleSize = overviewTitleSize(depth, maxDepth, zoom);
  const titleWidth = estimatedTextWidth(name, titleSize);
  const badgeWidth = estimatedTextWidth(typeName, 10) + 12;
  return {
    // Outer padding (7px each side) and border (1px each side).
    w: Math.min(TITLE_OVERVIEW_MAX_WIDTH, Math.ceil(Math.max(titleWidth, badgeWidth) + 16)),
    // Outer padding + border, title line, 3px gap, and 14px badge.
    h: Math.ceil(12 + titleSize * 1.15 + 3 + 14),
  };
}

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
const VIEW_LABELS: Record<MerinoView, string> = { overview: 'Overview', edit: 'Edit' };
const MERINO_OVERVIEW_ZOOMS = ['in', 'out'] as const satisfies readonly MerinoOverviewZoom[];
const OVERVIEW_ZOOM_LABELS: Record<MerinoOverviewZoom, string> = { out: 'Out', in: 'In' };

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

  // Which Tab, View, Overview zoom, and opened Overview Cards the user was last
  // looking at, retained for the browser tab's life so a development reload or a
  // trip to another app does not reset the workspace.
  const persisted = readMerinoViewState(props.sourceId);
  const [tab, setTab] = createSignal<MerinoTab>(
    persisted?.tab !== undefined && MERINO_TABS.includes(persisted.tab) ? persisted.tab : 'requirements');
  const [view, setView] = createSignal<MerinoView>(
    persisted?.view === 'overview' || persisted?.view === 'edit' ? persisted.view : 'edit');
  const [overviewZoom, setOverviewZoom] = createSignal<MerinoOverviewZoom>(
    persisted?.overviewZoom === 'in' || persisted?.overviewZoom === 'out' ? persisted.overviewZoom : 'in');
  const overviewRootIds = createMemo<readonly string[]>(() =>
    props.doc.overview?.requirements?.rootNodeIds ?? MERINO_OVERVIEW_ROOT_IDS);

  // The opened Overview Cards. Held here, not inside MerinoOverview, so they
  // survive switching to the Edit View and back. The Tab-change reset and the
  // Overview-root reconcile that used to live in MerinoOverview run here for the
  // same reason — a pin made from the Edit View must still take effect.
  const [disclosure, setDisclosure] = createSignal<MerinoOverviewDisclosureState>(
    isMerinoOverviewDisclosureState(persisted?.disclosure)
      ? persisted.disclosure
      : { cards: initialCards(props.doc, tab(), overviewRootIds()), activeChildByParent: {} });
  createEffect(on(tab, (nextTab) => {
    setDisclosure({ cards: initialCards(props.doc, nextTab, overviewRootIds()), activeChildByParent: {} });
  }, { defer: true }));
  createEffect(on(overviewRootIds, () => {
    setDisclosure((state) => reconcileMerinoOverviewRoots(state, props.doc, tab(), overviewRootIds()));
  }, { defer: true }));
  createEffect(() => {
    writeMerinoViewState(props.sourceId, {
      tab: tab(), view: view(), overviewZoom: overviewZoom(), disclosure: disclosure(),
    });
  });
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [managing, setManaging] = createSignal(false);
  let focusReturnView: Transform | undefined;
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
  const maxDepth = createMemo(() => Math.max(0, ...renderNodes().map((node) => node.depth)));
  const visualLod = createMemo<VisualLodDeclaration[]>(() => {
    const deepest = maxDepth();
    const typeMap = typesById();
    const renderNodeById = new Map(renderNodes().map((node) => [node.node.id, node]));
    const containmentRootId = (renderNode: MerinoRenderNode): string => {
      let current = renderNode;
      const visited = new Set<string>();
      while (current.contained && current.node.parent !== undefined && !visited.has(current.node.id)) {
        visited.add(current.node.id);
        const parent = renderNodeById.get(current.node.parent);
        if (!parent?.isContainer) break;
        current = parent;
      }
      return current.node.id;
    };
    return renderNodes().map((renderNode) => {
      const type = typeMap.get(renderNode.node.type);
      const typeName = type?.name ?? renderNode.node.type;
      return {
        id: `merino-identity:${renderNode.node.id}`,
        anchor: {
          nodeId: renderNode.node.id,
          placement: 'top-left',
          offset: { x: 10, y: 9 },
        },
        // Depth is the dominant ordering. Within one depth, Containers earn
        // the scarce overview space before leaf Nodes.
        priority: (deepest - renderNode.depth) * 100
          + (renderNode.isContainer ? 20 : 0)
          + (renderNode.hasChildren ? 1 : 0),
        collisionGroup: 'merino-identities',
        pointerEvents: 'auto',
        admission: {
          group: `merino-subtree:${containmentRootId(renderNode)}`,
          rank: renderNode.depth,
        },
        maxZoom: TITLE_OVERVIEW_START_ZOOM,
        placement: {
          candidates: ['top-left', 'above-left', 'above'],
          displacement: {
            maxDistance: TITLE_OVERVIEW_MAX_DISPLACEMENT,
            step: 12,
            directions: ['up'],
          },
          allowOcclusion: false,
        },
        size: {
          key: `${renderNode.node.name}\u0000${typeName}\u0000${renderNode.depth}/${deepest}`,
          estimate: (zoom) => estimatedOverviewIdentitySize(
            renderNode.node.name,
            typeName,
            renderNode.depth,
            deepest,
            zoom,
          ),
        },
        render: ({ zoom }) => (
          <MerinoOverviewIdentity
            name={renderNode.node.name}
            typeName={typeName}
            typeColor={type ? tokenVar(type.color) : 'var(--border)'}
            depth={renderNode.depth}
            maxDepth={deepest}
            zoom={zoom}
            onFocus={() => focusNode(renderNode.node.id)}
          />
        ),
      };
    });
  });

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

  const menuDeps: MerinoMenuDeps = { doc: () => props.doc, recentTypeIds, overviewRootIds };

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
    // Release over a Container files the new Node into it (mirrors endDrag): a
    // freeform Container takes the drop point in its child-area frame, a list
    // Container appends. Released over the background, the Node stays top-level.
    const target = findContainerAtPoint(renderNodes(), point.x, point.y);
    const targetRn = target !== null ? renderNodes().find((n) => n.node.id === target) : undefined;
    const base = { type: 'addNode' as const, id, tab: source.tab, nodeType: source.type, name: 'New node' };
    let addNode: MerinoAction;
    if (targetRn?.isList) {
      addNode = { ...base, parent: target!, order: props.doc.nodes.filter((n) => n.parent === target).length };
    } else if (targetRn) {
      const origin = childAreaOrigin(targetRn.node);
      addNode = { ...base, parent: target!, x: point.x - (targetRn.x + origin.x), y: point.y - (targetRn.y + origin.y) };
    } else {
      addNode = { ...base, x: point.x, y: point.y };
    }
    dispatchAction([
      addNode,
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
      if (e.altKey || isEditableTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteSelection();
      } else if (!e.ctrlKey && !e.metaKey && e.key === 'Enter' && selectedId()) {
        e.preventDefault();
        focusNode(selectedId()!);
      } else if (!e.ctrlKey && !e.metaKey && e.key === 'Escape' && focusReturnView) {
        e.preventDefault();
        restoreFocusView();
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
    if (parentLayout === 'list') {
      coords = undefined;
      order = props.doc.nodes.filter(n => n.parent === parent).length;
    } else if (parentLayout === 'container') {
      // A freeform Container child placed from a canvas point (a right-click)
      // lands at that point in the Container's child-area frame; without a point
      // the projection stacks it.
      const prn = position !== undefined ? renderNodes().find(n => n.node.id === parent) : undefined;
      if (prn && position !== undefined) {
        const origin = childAreaOrigin(prn.node);
        coords = { x: position.x - (prn.x + origin.x), y: position.y - (prn.y + origin.y) };
      } else {
        coords = undefined;
      }
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

  // Add a child to a Container Card in the Overview. The child takes its
  // parent's Node Type by default (N6) and appends — a list gets the next order,
  // a freeform Container derives the slot. Returns the new id so the Overview
  // can open its Card.
  function addOverviewChild(parentId: string): string | undefined {
    const parentType = props.doc.nodes.find((n) => n.id === parentId)?.type;
    if (parentType === undefined) return undefined;
    const id = uniqueId(props.doc, 'n');
    const result = applyMerinoBatch(props.doc, [
      { type: 'addNode', id, tab: tab(), nodeType: parentType, name: 'New node', parent: parentId, placement: 'append' },
    ]);
    if (!result.ok) {
      props.onRefused?.(result.error);
      return undefined;
    }
    props.dispatchDoc(result.doc);
    touchType(parentType);
    return id;
  }

  // Clone a Node from the Overview as a sibling under the same parent — same
  // Node Type and description, name suffixed " (copy N)", no Subnodes copied.
  // Returns the new id so the Overview can open its Card.
  function cloneOverviewNode(nodeId: string): string | undefined {
    const id = uniqueId(props.doc, 'n');
    const result = cloneNode(props.doc, nodeId, id);
    if (!result.ok) {
      props.onRefused?.(result.error);
      return undefined;
    }
    props.dispatchDoc(result.doc);
    const clonedType = props.doc.nodes.find((n) => n.id === nodeId)?.type;
    if (clonedType !== undefined) touchType(clonedType);
    return id;
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
      case 'node.add': {
        const position = typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : undefined;
        // Adding from a Container's background files the new Node into it, like a
        // drag-drop or the ctrl-drag gesture; from the empty canvas it stays top-level.
        const parent = position ? (findContainerAtPoint(renderNodes(), position.x, position.y) ?? undefined) : undefined;
        addNodeAt(parent, typeof p.nodeType === 'string' ? p.nodeType : undefined, position);
        break;
      }
      case 'node.addSubnode': {
        const parent = typeof p.parent === 'string' ? p.parent : undefined;
        addNodeAt(parent, parent === undefined ? undefined : props.doc.nodes.find((n) => n.id === parent)?.type);
        break;
      }
      case 'node.pinToOverview':
        if (typeof p.id === 'string' && props.doc.nodes.some((node) => node.id === p.id)) {
          dispatchAction([{ type: 'setOverviewRequirementsRoots', rootNodeIds: [...overviewRootIds(), p.id] }]);
        }
        break;
      case 'node.removeFromOverview':
        if (typeof p.id === 'string') {
          dispatchAction([{
            type: 'setOverviewRequirementsRoots',
            rootNodeIds: overviewRootIds().filter((id) => id !== p.id),
          }]);
        }
        break;
      case 'node.viewDownstream': if (typeof p.targetId === 'string') centerNode(p.targetId); break;
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

  function centerNode(id: string) {
    const node = renderNodes().find((renderNode) => renderNode.node.id === id);
    if (!node) return;
    canvasRef?.centerView({ x: node.x, y: node.y, width: node.w, height: node.h });
  }

  function focusNode(id: string) {
    const node = renderNodes().find((renderNode) => renderNode.node.id === id);
    if (!node || !canvasRef) return;
    focusReturnView ??= canvasRef.getTransform();
    canvasRef.focusView({ x: node.x, y: node.y, width: node.w, height: node.h }, 1);
  }

  function restoreFocusView() {
    if (!canvasRef || !focusReturnView) return;
    const previous = focusReturnView;
    focusReturnView = undefined;
    canvasRef.setView(previous);
  }

  function tidyContainer(id: string) {
    dispatchAction(buildRemoveOverlapActions(props.doc, id));
  }

  function flowContainer(id: string) {
    dispatchAction(buildFlowLayoutActions(props.doc, id, 'vertical'));
  }

  function flowContainerHorizontal(id: string) {
    dispatchAction(buildFlowLayoutActions(props.doc, id, 'horizontal'));
  }

  function selectView(next: MerinoView): void {
    if (view() === 'edit') canvasRef?.clearSelection();
    setView(next);
    setSelectedId(null);
  }

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0, display: 'flex', 'flex-direction': 'column' }}>
      <div class="flex items-center gap-1 border-b border-border bg-surface px-3 py-1">
        <For each={MERINO_TABS}>
          {(t) => (
            <button
              class={`rounded px-3 py-1 text-sm ${tab() === t ? 'bg-accent text-on-accent' : 'text-fg-muted hover:bg-surface-alt hover:text-fg'}`}
              onClick={() => { setTab(t); if (view() === 'edit') canvasRef?.clearSelection(); setSelectedId(null); }}
            >
              {TAB_LABELS[t]}
            </button>
          )}
        </For>
        <div
          class="ml-2 flex items-center gap-0.5 border-l border-border pl-2"
          role="group"
          aria-label="View"
        >
          <For each={MERINO_VIEWS}>
            {(item) => (
              <button
                class={`rounded px-3 py-1 text-sm ${view() === item ? 'bg-surface-alt font-medium text-fg shadow-sm' : 'text-fg-muted hover:bg-surface-alt hover:text-fg'}`}
                aria-pressed={view() === item}
                onClick={() => selectView(item)}
              >
                {VIEW_LABELS[item]}
              </button>
            )}
          </For>
        </div>
        <Show when={view() === 'overview'}>
          <div
            class="ml-2 flex items-center gap-0.5 border-l border-border pl-2"
            role="group"
            aria-label="Overview zoom"
          >
            <For each={MERINO_OVERVIEW_ZOOMS}>
              {(item) => (
                <button
                  class={`rounded px-3 py-1 text-sm ${overviewZoom() === item ? 'bg-surface-alt font-medium text-fg shadow-sm' : 'text-fg-muted hover:bg-surface-alt hover:text-fg'}`}
                  aria-pressed={overviewZoom() === item}
                  onClick={() => setOverviewZoom(item)}
                >
                  {OVERVIEW_ZOOM_LABELS[item]}
                </button>
              )}
            </For>
          </div>
        </Show>
        <button
          class="ml-auto rounded px-2 py-1 text-xs text-fg-muted hover:bg-surface-alt hover:text-fg"
          onClick={() => setManaging(true)}
        >
          Manage types…
        </button>
      </div>

      <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
        <Show
          when={view() === 'edit'}
          fallback={(
            <MerinoOverview
              doc={props.doc}
              zoom={overviewZoom()}
              sourceId={props.sourceId}
              disclosure={disclosure}
              setDisclosure={setDisclosure}
              onSetText={(nodeId, text) => dispatchAction([{ type: 'setNode', id: nodeId, text }])}
              onRename={(nodeId, name) => dispatchAction([{ type: 'setNode', id: nodeId, name }])}
              onSetType={(nodeId, typeId) => {
                dispatchAction([{ type: 'setNode', id: nodeId, nodeType: typeId }]);
                touchType(typeId);
              }}
              onAddChild={addOverviewChild}
              onClone={cloneOverviewNode}
              onDelete={(nodeId) => dispatchAction([{ type: 'removeNode', id: nodeId }])}
            />
          )}
        >
          <Canvas
          ref={(r) => { canvasRef = r; }}
          viewportOptions={transientViewportOptions(`luminous:merino:viewport:${props.sourceId}`)}
          edges={edges()}
          visualLod={visualLod()}
          edgeEmphasis={{ dimUnselected: true, selectedWidthMultiplier: 2 }}
          edgeLod={(_edge, state) => {
            if (state.zoom >= MERINO_STRUCTURAL_ZOOM) return {};
            const incident = state.emphasis === 'incident';
            const overview = state.zoom < TITLE_OVERVIEW_START_ZOOM;
            return {
              opacity: incident ? 1 : overview ? 0.28 : 0.38,
              labelVisible: !overview && incident,
            };
          }}
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
            onFlowHorizontal={flowContainerHorizontal}
            downstreamOf={(nodeId) => downstreamNodes(props.doc, nodeId)}
            onViewDownstream={centerNode}
            onFocusNode={focusNode}
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
        </Show>

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
  onFlowHorizontal: (nodeId: string) => void;
  downstreamOf: (nodeId: string) => ReadonlyArray<{ id: string; name: string }>;
  onViewDownstream: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
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
        const focused = () => hovered() || ctx.isSelected(id) || editingName() || isEdgeSource();
        const secondaryContentVisible = () => merinoSecondaryContentVisible(ctx.transform().k, focused());
        const delta = () => dragDelta(id);
        const size = () => {
          const preview = resizePreview();
          return preview?.nodeId === id ? preview : { width: rn.w, height: rn.h };
        };
        const tabVisible = () => secondaryContentVisible() && (hovered() || isEdgeSource());
        const offsetY = () => delta().dy + listShift(rn);
        const color = () => props.typeColor(rn.node.type);
        const stopDrag = (e: PointerEvent) => e.stopPropagation();
        const downstream = () => props.downstreamOf(id);
        const headerActionWidth = () => 20 + (downstream().length === 0 ? 0 : downstream().length === 1 ? 20 : 32);
        const identityCapacity = () => ({
          width: Math.max(0, size().width - headerActionWidth() - 22),
          height: NODE_HEADER_HEIGHT,
        });
        const headerActionCapacity = () => ({ width: headerActionWidth(), height: NODE_HEADER_HEIGHT });
        const containerControlCapacity = () => ({
          width: Math.max(0, size().width - 2 * CONTAINER_PADDING),
          height: Math.max(0, size().height - nodeHeight(rn.node) - 2 * CONTAINER_PADDING),
        });
        const detailCapacity = () => ({ width: Math.max(0, size().width - 20), height: size().height });
        const resizeHandleVisible = () => rn.isContainer
          && size().width * ctx.transform().k >= 48
          && size().height * ctx.transform().k >= 48;
        const downstreamAction = () => ({
          id: 'node.viewDownstream',
          label: '→',
          payload: { targetId: downstream()[0]?.id },
        });
        const downstreamButtonStyle = {
          'flex-shrink': '0',
          width: '20px',
          height: '20px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'border-radius': '4px',
          color: 'var(--fg-muted)',
          'font-size': '13px',
          cursor: 'pointer',
        } as const;
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
        const portOpacity = (kind: 'entry' | 'exit') => {
          if (!secondaryContentVisible()) return 0;
          return props.portUsed(id, kind) || hoveredPort() === kind || draggedPort() === kind ? 1 : 0.35;
        };
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
              onPointerDown={(e) => {
                // A left-press on a Container's empty interior starts a box-select
                // over its children instead of moving the Container: leave the
                // event untouched (no press, no stopPropagation) so cactus's
                // marquee handler — which allows a `[data-soft-container]` press —
                // picks it up. Pressing a child Node, or the Container's header,
                // still moves that Node. (Mirrors Atlas's node layer.)
                if (rn.isContainer && e.button === 0 && isOverContainerInterior(e.currentTarget as Element, e.clientX, e.clientY)) return;
                ctx.onNodePointerDown(id, e);
                gesture.beginPress(id, e);
              }}
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
                  <CounterScaleSlot
                    capacity={identityCapacity}
                    minScreenWidth={IDENTITY_MIN_SCREEN_WIDTH}
                    minScreenHeight={IDENTITY_MIN_SCREEN_HEIGHT}
                    hysteresis={SLOT_HYSTERESIS}
                    maxScale={1.5}
                    origin="left center"
                    active={() => ctx.transform().k >= TITLE_OVERVIEW_START_ZOOM}
                    style={{
                      height: '100%',
                      flex: '1 1 auto',
                    }}
                    contentStyle={{
                      display: 'flex',
                      'flex-direction': 'column',
                      'justify-content': 'center',
                      gap: '2px',
                      'min-width': '0',
                      'max-width': '100%',
                    }}
                  >
                    <Show
                      when={editingName()}
                      fallback={
                        <span
                          style={{
                            'font-size': `${TITLE_SCREEN_FONT_SIZE}px`,
                            'font-weight': '600',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            'white-space': 'nowrap',
                          }}
                          on:dblclick={(e) => {
                            e.stopPropagation();
                            if (ctx.transform().k < MERINO_STRUCTURAL_ZOOM) props.onFocusNode(id);
                            else setEditingName(true);
                          }}
                        >
                          {rn.node.name}
                        </span>
                      }
                    >
                      <input
                        data-no-pan="true"
                        style={{
                          'font-size': `${TITLE_SCREEN_FONT_SIZE}px`,
                          'font-weight': '600',
                          width: '100%',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          color: 'var(--fg)',
                        }}
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
                  </CounterScaleSlot>
                  <CounterScaleSlot
                    capacity={headerActionCapacity}
                    minScreenWidth={headerActionWidth() * 0.72}
                    minScreenHeight={CONTROL_MIN_SCREEN_HEIGHT}
                    hysteresis={SLOT_HYSTERESIS}
                    maxScale={1.5}
                    origin="right center"
                    active={() => ctx.transform().k >= TITLE_OVERVIEW_START_ZOOM}
                    clip={false}
                    style={{ width: `${headerActionWidth()}px`, height: '100%', 'flex-shrink': '0' }}
                    contentStyle={{ display: 'flex', 'align-items': 'center', 'justify-content': 'flex-end' }}
                  >
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
                    <Show when={downstream().length === 1}>
                      <button
                        data-no-pan="true"
                        title={`View downstream node: ${downstream()[0].name || downstream()[0].id}`}
                        style={downstreamButtonStyle}
                        on:pointerdown={stopDrag}
                        onClick={(e) => { e.stopPropagation(); props.onViewDownstream(downstream()[0].id); }}
                      >
                        →
                      </button>
                    </Show>
                    <Show when={downstream().length > 1}>
                      <SplitMenuButton
                        action={downstreamAction()}
                        items={downstreamMenuItems(downstream())}
                        title="View downstream node"
                        class="flex flex-none"
                        primaryClass="flex h-5 w-5 items-center justify-center rounded text-[13px] text-fg-muted"
                        triggerClass="flex h-5 w-3 items-center justify-center rounded text-[13px] text-fg-muted"
                        onAction={(actionId, payload) => {
                          if (actionId !== 'node.viewDownstream') return;
                          const targetId = (payload as { targetId?: unknown } | undefined)?.targetId;
                          if (typeof targetId === 'string') props.onViewDownstream(targetId);
                        }}
                      />
                    </Show>
                  </CounterScaleSlot>
                </div>
                <Show
                  when={rn.node.expanded && secondaryContentVisible()}
                  fallback={
                    <CounterScaleSlot
                      capacity={detailCapacity}
                      minScreenWidth={72}
                      minScreenHeight={38}
                      hysteresis={SLOT_HYSTERESIS}
                      maxScale={1.5}
                      origin="left top"
                      clip={false}
                      style={{ height: `${NODE_HEIGHT - NODE_HEADER_HEIGHT}px`, 'flex-shrink': '0' }}
                      contentStyle={{ display: 'block', width: '100%' }}
                    >
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
                    </CounterScaleSlot>
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
                        ref={(el) => queueMicrotask(() => {
                          if (ctx.isSelected(id) && ctx.transform().k >= MERINO_STRUCTURAL_ZOOM) el.focus();
                        })}
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
                    data-soft-container="true"
                    style={{
                      flex: '1 1 auto',
                      'min-height': '0',
                      margin: `${CONTAINER_PADDING}px`,
                      background: `color-mix(in oklch, ${color()} 10%, var(--color-merino-container-fill))`,
                      'border-radius': '2px',
                    }}
                  >
                    <CounterScaleSlot
                      capacity={containerControlCapacity}
                      minScreenWidth={rn.isList ? 58 : 136}
                      minScreenHeight={CONTROL_MIN_SCREEN_HEIGHT}
                      hysteresis={SLOT_HYSTERESIS}
                      maxScale={3}
                      origin="left top"
                      clip={false}
                      style={{ height: '22px', width: '100%' }}
                      contentStyle={{ display: 'flex', 'align-items': 'center', gap: '4px', padding: '3px 6px', 'white-space': 'nowrap' }}
                    >
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
                                  title="Flow down — stack children into rows so directed edges flow downward"
                                  style={chipStyle}
                                  on:pointerdown={stopDrag}
                                  onClick={(e) => { e.stopPropagation(); props.onFlow(id); }}
                                >
                                  ↓ Flow
                                </button>
                                <button
                                  data-no-pan="true"
                                  title="Flow right — stack children into columns so directed edges flow rightward"
                                  style={chipStyle}
                                  on:pointerdown={stopDrag}
                                  onClick={(e) => { e.stopPropagation(); props.onFlowHorizontal(id); }}
                                >
                                  → Flow
                                </button>
                              </>
                            );
                          })()}
                        </Show>
                    </CounterScaleSlot>
                  </div>
                </Show>
              </div>
            </NodeContainer>
            <Show when={rn.isContainer}>
              <ResizeHandle
                nodeId={id}
                rect={portRect}
                visible={resizeHandleVisible}
                zIndex={() => 1000 + rn.depth}
                onResizePointerDown={(nodeId, direction, event) => gesture.beginResize(nodeId, direction, event)}
              />
            </Show>
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
                    'pointer-events': secondaryContentVisible() ? 'auto' : 'none',
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

/**
 * Merino's overview representation of a Node's identity. It reads the same
 * domain data as the editable header, but is an independent representation
 * rendered and coordinated by cactus's screen-space Visual LOD layer.
 */
function MerinoOverviewIdentity(props: {
  name: string;
  typeName: string;
  typeColor: string;
  depth: number;
  maxDepth: number;
  zoom: () => number;
  onFocus: () => void;
}): JSX.Element {
  const titleSize = () => overviewTitleSize(props.depth, props.maxDepth, props.zoom());
  const prominence = () => props.maxDepth === 0 ? 1 : 1 - props.depth / props.maxDepth;
  const depthShade = () => props.maxDepth === 0 ? 0 : (props.depth / props.maxDepth) * 0.08;
  const surfaceWeight = () => Math.round(74 + prominence() * 26);
  const borderWeight = () => Math.round(52 + prominence() * 48);

  return (
    <div
      on:dblclick={(event) => { event.stopPropagation(); props.onFocus(); }}
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'flex-start',
        'box-sizing': 'border-box',
        gap: '3px',
        'max-width': `${TITLE_OVERVIEW_MAX_WIDTH}px`,
        'min-width': '0',
        'white-space': 'nowrap',
        padding: '5px 7px',
        background: `linear-gradient(rgb(0 0 0 / ${depthShade()}), rgb(0 0 0 / ${depthShade()})), color-mix(in oklch, var(--surface) ${surfaceWeight()}%, var(--canvas))`,
        border: `1px solid color-mix(in oklch, var(--border) ${borderWeight()}%, transparent)`,
        'border-radius': '6px',
        'box-shadow': `0 2px 5px rgb(0 0 0 / ${0.06 + prominence() * 0.1})`,
        cursor: 'zoom-in',
      }}
    >
      <span
        style={{
          'font-size': `${titleSize()}px`,
          'font-weight': '600',
          'line-height': '1.15',
          color: 'var(--fg)',
          'max-width': '100%',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}
      >
        {props.name}
      </span>
      <span
        style={{
          'font-size': '10px',
          'font-weight': '600',
          'line-height': '1',
          color: 'var(--type-badge-fg)',
          background: props.typeColor,
          'box-sizing': 'border-box',
          'max-width': '100%',
          overflow: 'hidden',
          padding: '2px 6px',
          'border-radius': '9999px',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}
      >
        {props.typeName}
      </span>
    </div>
  );
}
