import type { MerinoAction, MerinoDocument, MerinoEdgeType, MerinoNode, MerinoNodeType, MerinoPortPosition, MerinoTab } from '@luminous/core/merino';
import type { EdgeDeclaration, EdgeRoute, RegisteredNodeRect, RoutePoint } from '@luminous/cactus';
import { boundaryPoint, resolveAbsolutePositionByParentOf } from '@luminous/cactus';

export const NODE_WIDTH = 168;
/** The name-and-type header, fixed on both collapsed and expanded Nodes. */
export const NODE_HEADER_HEIGHT = 44;
/** The uniform compact height every leaf Node keeps until it is pinned open —
 * the header plus one line of detail preview. */
export const NODE_HEIGHT = NODE_HEADER_HEIGHT + 20;
/** Extra height a pinned-open leaf Node gains, turning the preview line into a
 * full detail body. */
export const NODE_BODY_HEIGHT = 104;

/** A Container's title band — name and Type badge, above its detail and child area. */
export const CONTAINER_HEADER = NODE_HEADER_HEIGHT;
/** Interior padding between a Container's box edge and its children. */
export const CONTAINER_PADDING = 12;
/** Small left-aligned label inside the colored Container well. */
export const CONTAINER_LABEL_HEIGHT = 16;
/** The child-area height an empty Container keeps, so it still reads as a box
 * something can be dropped into. */
export const EMPTY_CONTAINER_BODY = 48;
/** Fallback vertical step when a free Container's child has no stored position. */
const STACK_STEP = NODE_HEIGHT + 12;
/** Vertical gap between the stacked children of a `list` Container. */
export const LIST_GAP = 8;

const GRID_COLS = 4;
const GRID_X = NODE_WIDTH + 48;
const GRID_Y = NODE_HEIGHT + 40;

/** A leaf Node's drawn height: uniform unless it is pinned open (progressive
 * disclosure), when it grows to fit its detail body. */
export function nodeHeight(node: MerinoNode): number {
  return node.expanded ? NODE_HEIGHT + NODE_BODY_HEIGHT : NODE_HEIGHT;
}

/** Where a Container's children begin, inside its own rect: after the name,
 * type badge, and editable detail body, then inside the white bezel. */
export function childAreaOrigin(node: MerinoNode): { x: number; y: number } {
  return { x: CONTAINER_PADDING, y: nodeHeight(node) + CONTAINER_PADDING + CONTAINER_LABEL_HEIGHT };
}

// ── Boundary Ports ──────────────────────────────────────────────────────────
// Copied from Atlas's port model (doc01.07): an Edge crossing a Container's box
// passes through a Port on that box's boundary, so you can see where it enters
// and leaves. Merino keeps its own copy so the two can diverge. Unlike Atlas,
// Merino has no container bezel, so a Port sits on the Container's own outer
// rect rather than a bezel centerline.

/** Long axis of the drawn Port stub — along the side it clasps. */
export const MERINO_PORT_LENGTH = 40;
/** Short axis of the drawn Port stub — across the border. */
export const MERINO_PORT_THICKNESS = 14;
export const DEFAULT_ENTRY_PORT: MerinoPortPosition = { side: 'left', offset: 0.5 };
export const DEFAULT_EXIT_PORT: MerinoPortPosition = { side: 'right', offset: 0.5 };

export function merinoPortDimensions(position: MerinoPortPosition): { width: number; height: number } {
  return position.side === 'top' || position.side === 'bottom'
    ? { width: MERINO_PORT_LENGTH, height: MERINO_PORT_THICKNESS }
    : { width: MERINO_PORT_THICKNESS, height: MERINO_PORT_LENGTH };
}

/** The point on a Container box's boundary where a Port is drawn. */
export function merinoPortPoint(rect: RegisteredNodeRect, position: MerinoPortPosition): RoutePoint {
  const size = merinoPortDimensions(position);
  return boundaryPoint(rect, position, size.width, size.height);
}

/** The pair of points an Edge threads between at a Port: just inside the border
 * and just outside it, so the line pokes cleanly through the box wall. */
export function merinoPortAnchors(rect: RegisteredNodeRect, position: MerinoPortPosition): { inside: RoutePoint; outside: RoutePoint } {
  const point = merinoPortPoint(rect, position);
  const half = MERINO_PORT_THICKNESS / 2;
  switch (position.side) {
    case 'top': return { inside: { x: point.x, y: point.y + half }, outside: { x: point.x, y: point.y - half } };
    case 'right': return { inside: { x: point.x - half, y: point.y }, outside: { x: point.x + half, y: point.y } };
    case 'bottom': return { inside: { x: point.x, y: point.y - half }, outside: { x: point.x, y: point.y + half } };
    case 'left': return { inside: { x: point.x + half, y: point.y }, outside: { x: point.x - half, y: point.y } };
  }
}

const ROUTE_EPSILON = 0.0001;

/** The absolute interior region of a Container box — below its header/detail
 * band, inset by the padding — used to decide which box a route segment sits in. */
function childAreaAbs(rect: RegisteredNodeRect, node: MerinoNode): { x: number; y: number; w: number; h: number } {
  const origin = childAreaOrigin(node);
  return { x: rect.x + origin.x, y: rect.y + origin.y, w: rect.w - 2 * CONTAINER_PADDING, h: rect.h - origin.y - CONTAINER_PADDING };
}

function rectCenter(rect: RegisteredNodeRect): RoutePoint {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Where the ray from `from` toward `toward` leaves `rect` — the Edge's first
 * point on the source box, or last on the target box. */
function exitRect(from: RoutePoint, toward: RoutePoint, rect: RegisteredNodeRect): RoutePoint {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const tx = dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

function containsPoint(rect: { x: number; y: number; w: number; h: number }, point: RoutePoint): boolean {
  return point.x >= rect.x - ROUTE_EPSILON && point.x <= rect.x + rect.w + ROUTE_EPSILON
    && point.y >= rect.y - ROUTE_EPSILON && point.y <= rect.y + rect.h + ROUTE_EPSILON;
}

function withoutDuplicatePoints(points: RoutePoint[]): RoutePoint[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.hypot(point.x - previous.x, point.y - previous.y) > ROUTE_EPSILON;
  });
}

export interface MerinoRenderNode {
  node: MerinoNode;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The child-derived lower bound for the rendered box. A Container can have
   * more empty room than this, but never less. */
  minW?: number;
  minH?: number;
  /** This Node's Type is a Container — it draws as a box holding its children. */
  isContainer: boolean;
  /** This Node's Type is a `list` Container — children stack in an explicit order. */
  isList: boolean;
  /** This Node sits inside a Container (its parent's Type is a Container). */
  contained: boolean;
  /** Containment children count > 0 (only Containers ever have these). */
  hasChildren: boolean;
  /** Containment nesting depth — 0 at the top level. Drives paint order. */
  depth: number;
}

export interface MerinoProjection {
  nodes: MerinoRenderNode[];
  edges: EdgeDeclaration[];
}

/** The CSS var backing a Merino color token, e.g. accent-4 → var(--color-merino-accent-4). */
export function tokenVar(token: string): string {
  return `var(--color-merino-${token})`;
}

export function nodeTypeById(doc: MerinoDocument): Map<string, MerinoNodeType> {
  return new Map(doc.nodeTypes.map(t => [t.id, t]));
}

export function projectMerino(doc: MerinoDocument, tab: MerinoTab): MerinoProjection {
  const nodesOnTab = doc.nodes.filter(n => n.tab === tab);
  const idsOnTab = new Set(nodesOnTab.map(n => n.id));
  const typeById = nodeTypeById(doc);
  const edgeTypeById = new Map<string, MerinoEdgeType>(doc.edgeTypes.map(t => [t.id, t]));
  const nodeById = new Map(nodesOnTab.map(n => [n.id, n]));

  const layoutOf = (n: MerinoNode): 'container' | 'list' | undefined => typeById.get(n.type)?.layout;
  const isContainerNode = (n: MerinoNode): boolean => layoutOf(n) !== undefined;
  const isListNode = (n: MerinoNode): boolean => layoutOf(n) === 'list';

  const tabIndexOf = new Map(nodesOnTab.map((n, i) => [n.id, i]));

  // A parent link counts as containment only when the parent is on this Tab and
  // its Type is a Container; every other parent link is a tethered Subnode,
  // drawn as a dotted Edge below.
  const containerParentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const n of nodesOnTab) {
    if (n.parent === undefined) continue;
    const parent = nodeById.get(n.parent);
    if (parent === undefined || !isContainerNode(parent)) continue;
    containerParentOf.set(n.id, n.parent);
    const list = childrenOf.get(n.parent) ?? [];
    list.push(n.id);
    childrenOf.set(n.parent, list);
  }
  // A `list` Container draws its children by ascending `order`; a child without
  // one falls to the end, ties broken by document position so the stack is stable.
  for (const [parentId, kids] of childrenOf) {
    if (!isListNode(nodeById.get(parentId)!)) continue;
    kids.sort((a, b) => {
      const oa = nodeById.get(a)!.order ?? Number.MAX_SAFE_INTEGER;
      const ob = nodeById.get(b)!.order ?? Number.MAX_SAFE_INTEGER;
      return oa - ob || (tabIndexOf.get(a)! - tabIndexOf.get(b)!);
    });
  }

  // A Node's own stored position, read in its own frame: relative to its
  // Container's child area when contained, absolute otherwise. A `list`
  // Container's children are the exception — their slots are computed from
  // sibling heights inside sizeOf, not stored. Missing positions get a
  // deterministic fallback: a vertical stack for a free Container's children, a
  // canvas grid for top-level Nodes.
  const relativePositions = new Map<string, { x: number; y: number }>();
  let topLevelIndex = 0;
  for (const n of nodesOnTab) {
    const parentId = containerParentOf.get(n.id);
    if (parentId !== undefined && isListNode(nodeById.get(parentId)!)) continue;
    if (n.x !== undefined && n.y !== undefined) {
      relativePositions.set(n.id, { x: n.x, y: n.y });
      if (parentId === undefined) topLevelIndex += 1;
      continue;
    }
    if (parentId !== undefined) {
      const siblingIndex = (childrenOf.get(parentId) ?? []).indexOf(n.id);
      relativePositions.set(n.id, { x: 0, y: siblingIndex * STACK_STEP });
    } else {
      relativePositions.set(n.id, {
        x: (topLevelIndex % GRID_COLS) * GRID_X,
        y: Math.floor(topLevelIndex / GRID_COLS) * GRID_Y,
      });
      topLevelIndex += 1;
    }
  }

  const sizes = new Map<string, { w: number; h: number; minW: number; minH: number }>();
  function sizeOf(id: string): { w: number; h: number; minW: number; minH: number } {
    const cached = sizes.get(id);
    if (cached) return cached;
    const node = nodeById.get(id)!;
    let size: { w: number; h: number; minW: number; minH: number };
    const children = childrenOf.get(id) ?? [];
    if (!isContainerNode(node)) {
      size = { w: NODE_WIDTH, h: nodeHeight(node), minW: NODE_WIDTH, minH: nodeHeight(node) };
    } else if (children.length === 0) {
      const minW = NODE_WIDTH;
      const minH = nodeHeight(node) + CONTAINER_PADDING + CONTAINER_LABEL_HEIGHT + EMPTY_CONTAINER_BODY + CONTAINER_PADDING;
      size = { w: Math.max(minW, node.width ?? 0), h: Math.max(minH, node.height ?? 0), minW, minH };
    } else if (isListNode(node)) {
      // Stack the ordered children top-to-bottom, recording each slot as we go.
      let y = 0;
      let maxW = 0;
      for (const childId of children) {
        const childSize = sizeOf(childId);
        relativePositions.set(childId, { x: 0, y });
        maxW = Math.max(maxW, childSize.w);
        y += childSize.h + LIST_GAP;
      }
      const innerHeight = y - LIST_GAP;
      const minW = Math.max(NODE_WIDTH, maxW + 2 * CONTAINER_PADDING);
      const minH = nodeHeight(node) + CONTAINER_PADDING + CONTAINER_LABEL_HEIGHT + innerHeight + CONTAINER_PADDING;
      size = { w: Math.max(minW, node.width ?? 0), h: Math.max(minH, node.height ?? 0), minW, minH };
    } else {
      let maxX = 0;
      let maxY = 0;
      for (const childId of children) {
        const pos = relativePositions.get(childId) ?? { x: 0, y: 0 };
        const childSize = sizeOf(childId);
        maxX = Math.max(maxX, pos.x + childSize.w);
        maxY = Math.max(maxY, pos.y + childSize.h);
      }
      const minW = Math.max(NODE_WIDTH, maxX + 2 * CONTAINER_PADDING);
      const minH = nodeHeight(node) + CONTAINER_PADDING + CONTAINER_LABEL_HEIGHT + maxY + CONTAINER_PADDING;
      size = { w: Math.max(minW, node.width ?? 0), h: Math.max(minH, node.height ?? 0), minW, minH };
    }
    sizes.set(id, size);
    return size;
  }
  // Size every Node before folding — a `list` Container fills in its children's
  // relativePositions as a side effect, which the fold below then reads.
  for (const n of nodesOnTab) sizeOf(n.id);

  // Offset each contained child's relative slot into its Container's child area
  // before the fold sums the parent chain — the raw relativePositions are what
  // sizeOf measures, so the origin inset lives only here.
  const foldPositions = new Map<string, { x: number; y: number }>();
  for (const [id, pos] of relativePositions) {
    const parent = containerParentOf.has(id) ? nodeById.get(containerParentOf.get(id)!) : undefined;
    const origin = parent ? childAreaOrigin(parent) : undefined;
    foldPositions.set(
      id,
      origin ? { x: pos.x + origin.x, y: pos.y + origin.y } : pos,
    );
  }

  function depthOf(id: string): number {
    let depth = 0;
    let current = containerParentOf.get(id);
    while (current !== undefined) {
      depth += 1;
      current = containerParentOf.get(current);
    }
    return depth;
  }

  // Containers must paint before their children so an overlapping child (drawn
  // later in the DOM) stacks above the box that holds it.
  const ordered = [...nodesOnTab].sort((a, b) => depthOf(a.id) - depthOf(b.id));

  const nodes: MerinoRenderNode[] = ordered.map((node) => {
    const abs = resolveAbsolutePositionByParentOf(node.id, foldPositions, containerParentOf);
    const size = sizeOf(node.id);
    return {
      node,
      x: abs.x,
      y: abs.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      isContainer: isContainerNode(node),
      isList: isListNode(node),
      contained: containerParentOf.has(node.id),
      hasChildren: (childrenOf.get(node.id) ?? []).length > 0,
      depth: depthOf(node.id),
    };
  });

  // Container-crossing Edge routing, copied from Atlas: thread each authored
  // Edge through the boundary Ports of the Containers it leaves and enters, so a
  // connection between deeply nested Nodes is legible at each box wall. A null
  // route (endpoints share no Container to cross) falls back to cactus's direct
  // line.
  const containerAncestors = (id: string): string[] => {
    const out: string[] = [];
    // A Container endpoint is itself a boundary to cross: an incoming Edge
    // reaches its entry Port and an outgoing Edge leaves through its exit Port.
    // A leaf begins at its containing Container as before.
    let current = isContainerNode(nodeById.get(id)!) ? id : containerParentOf.get(id);
    while (current !== undefined) { out.push(current); current = containerParentOf.get(current); }
    return out;
  };
  const containerIds = [...childrenOf.keys()];
  const depthById = new Map(nodesOnTab.map((n) => [n.id, depthOf(n.id)]));

  const routeEdge = (fromId: string, toId: string, rects: ReadonlyMap<string, RegisteredNodeRect>): EdgeRoute | null => {
    const sourceRect = rects.get(fromId);
    const targetRect = rects.get(toId);
    if (!sourceRect || !targetRect) return null;
    const sourceAncestors = containerAncestors(fromId);
    const targetAncestors = containerAncestors(toId);
    const targetAncestorSet = new Set(targetAncestors);
    const lca = sourceAncestors.find((id) => targetAncestorSet.has(id));
    const sourceContainers = lca ? sourceAncestors.slice(0, sourceAncestors.indexOf(lca)) : sourceAncestors;
    const destinationContainers = lca
      ? targetAncestors.slice(0, targetAncestors.indexOf(lca)).reverse()
      : [...targetAncestors].reverse();
    if (sourceContainers.length === 0 && destinationContainers.length === 0) return null;

    const sourceCenter = rectCenter(sourceRect);
    const targetCenter = rectCenter(targetRect);
    if (sourceCenter.x === targetCenter.x && sourceCenter.y === targetCenter.y) return null;

    const sourcePorts: RoutePoint[] = [];
    for (const id of sourceContainers) {
      const rect = rects.get(id);
      const node = nodeById.get(id);
      if (!rect || !node) return null;
      const anchors = merinoPortAnchors(rect, node.ports?.exit ?? DEFAULT_EXIT_PORT);
      sourcePorts.push(anchors.inside, anchors.outside);
    }
    const destinationPorts: RoutePoint[] = [];
    for (const id of destinationContainers) {
      const rect = rects.get(id);
      const node = nodeById.get(id);
      if (!rect || !node) return null;
      const anchors = merinoPortAnchors(rect, node.ports?.entry ?? DEFAULT_ENTRY_PORT);
      destinationPorts.push(anchors.outside, anchors.inside);
    }
    const crossingPoints = [...sourcePorts, ...destinationPorts];
    const points: RoutePoint[] = [
      exitRect(sourceCenter, crossingPoints[0] ?? targetCenter, sourceRect),
      ...crossingPoints,
      exitRect(targetCenter, crossingPoints[crossingPoints.length - 1] ?? sourceCenter, targetRect),
    ];
    const routePoints = withoutDuplicatePoints(points);
    if (routePoints.length < 2) return null;
    const segmentLayers = routePoints.slice(1).map((end, index) => {
      const start = routePoints[index];
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      let scope: string | undefined;
      for (const id of containerIds) {
        const rect = rects.get(id);
        const node = nodeById.get(id);
        if (rect && node && containsPoint(childAreaAbs(rect, node), midpoint)
          && (scope === undefined || (depthById.get(id) ?? 0) > (depthById.get(scope) ?? 0))) scope = id;
      }
      return scope === undefined ? -1 : 2 * (depthById.get(scope) ?? 0) + 1;
    });
    return { points: routePoints, segmentLayers };
  };

  const edges: EdgeDeclaration[] = [];

  // A tethered Subnode's dotted parent link — only when the parent is NOT a
  // Container (a contained child shows its membership by sitting inside the box
  // instead).
  for (const node of nodesOnTab) {
    if (node.parent === undefined || !idsOnTab.has(node.parent)) continue;
    if (containerParentOf.has(node.id)) continue;
    edges.push({
      id: `sub:${node.id}`,
      sourceId: node.parent,
      targetId: node.id,
      styling: { dash: 'dotted', arrowHead: false, colorToken: 'fg-muted' },
    });
  }

  // Authored typed Edges.
  for (const edge of doc.edges) {
    if (edge.tab !== tab) continue;
    const type = edgeTypeById.get(edge.type);
    edges.push({
      id: edge.id,
      sourceId: edge.from,
      targetId: edge.to,
      styling: {
        dash: type?.dash ?? 'solid',
        arrowHead: type?.arrowHead ?? true,
        colorToken: type ? `color-merino-${type.color}` : 'fg',
      },
      routeBuilder: (rects) => routeEdge(edge.from, edge.to, rects),
    });
  }

  return { nodes, edges };
}

/**
 * Containers keep the room they have gained while their children change. The
 * returned floors are applied with the same batch as the change, so an explicit
 * resize is the only action that deliberately changes that extra room.
 */
export function growOnlyContainerActions(
  before: MerinoDocument,
  after: MerinoDocument,
  sizeTouchedIds: ReadonlySet<string>,
): MerinoAction[] {
  const beforeById = new Map<string, MerinoRenderNode>();
  for (const tab of ['requirements', 'deployments'] as const) {
    for (const node of projectMerino(before, tab).nodes) beforeById.set(node.node.id, node);
  }
  const actions: MerinoAction[] = [];
  for (const tab of ['requirements', 'deployments'] as const) {
    for (const node of projectMerino(after, tab).nodes) {
      const previous = beforeById.get(node.node.id);
      if (!node.isContainer || !previous?.isContainer || sizeTouchedIds.has(node.node.id)) continue;
      const action: Extract<MerinoAction, { type: 'setNode' }> = { type: 'setNode', id: node.node.id };
      if (node.w < previous.w) action.width = previous.w;
      if (node.h < previous.h) action.height = previous.h;
      if (action.width !== undefined || action.height !== undefined) actions.push(action);
    }
  }
  return actions;
}

/**
 * The drop-target Container under a canvas-space point: the deepest Container
 * render node whose box contains it, skipping `exclude` (the dragged subtree).
 * Rect-math over the projected boxes, matching the paint order (`depth`) so
 * overlaps resolve the same way they draw.
 */
export function findContainerAtPoint(
  nodes: readonly MerinoRenderNode[],
  x: number,
  y: number,
  exclude?: ReadonlySet<string>,
): string | null {
  let best: MerinoRenderNode | null = null;
  for (const rn of nodes) {
    if (!rn.isContainer) continue;
    if (exclude?.has(rn.node.id)) continue;
    if (x < rn.x || y < rn.y || x > rn.x + rn.w || y > rn.y + rn.h) continue;
    if (!best || rn.depth >= best.depth) best = rn;
  }
  return best?.node.id ?? null;
}

/**
 * Where a Node dropped at canvas-space `centerY` would land among a `list`
 * Container's stacked children — the 0-based slot index. Children are compared
 * by their rendered vertical centers (they are already laid out in order), and
 * `draggedId` is left out so a within-list reorder measures against the others.
 */
export function listInsertionIndex(
  nodes: readonly MerinoRenderNode[],
  containerId: string,
  draggedId: string,
  centerY: number,
): number {
  return nodes
    .filter((rn) => rn.contained && rn.node.parent === containerId && rn.node.id !== draggedId)
    .filter((rn) => rn.y + rn.h / 2 < centerY)
    .length;
}
