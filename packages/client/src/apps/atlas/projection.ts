import type { AtlasDocument, AtlasEdge, AtlasNode, AtlasPortPosition } from '@luminous/core/atlas';
import type { EdgeDeclaration, EdgeRoute, RegisteredNodeRect, RoutePoint } from '@luminous/cactus';
import { boundaryPoint, resolveAbsolutePositionByParentOf } from '@luminous/cactus';
import { layoutAtlas } from './layout.ts';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
export const CONTAINER_PADDING = 10;
export const CONTAINER_HEADER = 72; // fixed title-row + Content-band height; not user-draggable
/** Gap between a Node's outer edge and the container box's edge — the bezel
 * that makes the container's own bordered box visible as distinct from the
 * Node's frame (doc01.07.04 R40). */
export const CONTAINER_BEZEL = 8;
/** Floor on a dragged `contentHeight`, so the resize handle can't collapse a Node to nothing. */
export const MIN_CONTENT_HEIGHT = 40;
/** Floor on a dragged `contentWidth`, so the resize handle can't collapse a Node to nothing. */
export const MIN_CONTENT_WIDTH = 80;

/** A container's header-band height: a fixed constant (title row + the
 * always-present Content band). `contentHeight` no longer governs this — it
 * is reserved as the container-box floor for the resize phase instead. */
export function containerHeaderHeight(_node?: AtlasNode): number {
  return CONTAINER_HEADER;
}

/** A leaf's whole-box height: its stored override, else the fixed constant. */
export function leafHeight(node?: AtlasNode): number {
  return node?.contentHeight ?? NODE_HEIGHT;
}

/** A leaf's whole-box width: its stored override, else the fixed constant. */
export function leafWidth(node?: AtlasNode): number {
  return node?.contentWidth ?? NODE_WIDTH;
}

/** Parent-relative: where a container's children begin, inside its own rect —
 * past the header band, then the bezel gap into the container box, then the
 * box's own interior padding. */
export function childAreaOrigin(node?: AtlasNode): { x: number; y: number } {
  return { x: CONTAINER_PADDING + CONTAINER_BEZEL, y: containerHeaderHeight(node) + CONTAINER_BEZEL };
}

/** The absolute rect of a container render node's own bordered box — its rect
 * inset by the header band on top and the bezel on every side the box sits
 * inset from (left, right, bottom, and the gap below the header). */
export function childArea(rn: { x: number; y: number; w: number; h: number; node?: AtlasNode }): { x: number; y: number; w: number; h: number } {
  const header = containerHeaderHeight(rn.node);
  return {
    x: rn.x + CONTAINER_BEZEL,
    y: rn.y + header + CONTAINER_BEZEL,
    w: rn.w - 2 * CONTAINER_BEZEL,
    h: rn.h - header - 2 * CONTAINER_BEZEL,
  };
}

/** The perimeter halfway across the bezel between a Container's inset box
 * and its Node frame. Ports clasp this centerline rather than sitting on the
 * inner edge of the bezel. */
export function containerBezelCenter(
  rn: { x: number; y: number; w: number; h: number; node?: AtlasNode },
): { x: number; y: number; w: number; h: number } {
  const area = childArea(rn);
  const halfBezel = CONTAINER_BEZEL / 2;
  return {
    x: area.x - halfBezel,
    y: area.y - halfBezel,
    w: area.w + 2 * halfBezel,
    h: area.h + 2 * halfBezel,
  };
}

/** A container's shrink-wrapped size given its children's bounding-box extent
 * `(maxX, maxY)` in its own child-area frame — the formula `sizeOf` (below)
 * and `growAncestors` (`layoutOverride.ts`) both need single-sourced, since a
 * live grow must match the committed re-projection of the same geometry.
 * Both axes account for the bezel inset so the container box wraps its
 * children with the bezel visible. `contentWidth`/`contentHeight`, when set,
 * are a floor on top of the child extent — never a ceiling — so a resize can
 * only ever grow the box past its children, never clip them (R38, R39). */
export function shrinkWrapSize(node: AtlasNode | undefined, maxX: number, maxY: number): { w: number; h: number } {
  const childExtentW = Math.max(leafWidth(node), maxX + 2 * (CONTAINER_PADDING + CONTAINER_BEZEL));
  const childExtentH = containerHeaderHeight(node) + CONTAINER_BEZEL + maxY + CONTAINER_BEZEL;
  return {
    w: node?.contentWidth !== undefined ? Math.max(childExtentW, node.contentWidth) : childExtentW,
    h: node?.contentHeight !== undefined ? Math.max(childExtentH, node.contentHeight) : childExtentH,
  };
}

function edgeId(edge: AtlasEdge, i: number): string {
  return `${edge.from}->${edge.to}-${i}`;
}

export function toEdgeDeclarations(doc: AtlasDocument): EdgeDeclaration[] {
  const routeEdge = createAtlasEdgeRouter(doc);
  return doc.edges.map((edge, i) => ({
    id: edgeId(edge, i),
    sourceId: edge.from,
    targetId: edge.to,
    styling: { arrowHead: true, dash: 'solid' },
    routeBuilder: (rects) => routeEdge(edge, rects),
  }));
}

const ROUTE_EPSILON = 0.0001;
export const ATLAS_PORT_LENGTH = 48;
export const ATLAS_PORT_THICKNESS = 16;
export const DEFAULT_ENTRY_PORT: AtlasPortPosition = { side: 'left', offset: 0.5 };
export const DEFAULT_EXIT_PORT: AtlasPortPosition = { side: 'right', offset: 0.5 };

export function atlasPortDimensions(position: AtlasPortPosition): { width: number; height: number } {
  return position.side === 'top' || position.side === 'bottom'
    ? { width: ATLAS_PORT_LENGTH, height: ATLAS_PORT_THICKNESS }
    : { width: ATLAS_PORT_THICKNESS, height: ATLAS_PORT_LENGTH };
}

export function atlasPortPoint(
  rn: { x: number; y: number; w: number; h: number; node?: AtlasNode },
  position: AtlasPortPosition,
): RoutePoint {
  const size = atlasPortDimensions(position);
  return boundaryPoint(containerBezelCenter(rn), position, size.width, size.height);
}

export function atlasPortAnchors(
  rn: { x: number; y: number; w: number; h: number; node?: AtlasNode },
  position: AtlasPortPosition,
): { inside: RoutePoint; outside: RoutePoint } {
  const point = atlasPortPoint(rn, position);
  const half = ATLAS_PORT_THICKNESS / 2;
  switch (position.side) {
    case 'top': return { inside: { x: point.x, y: point.y + half }, outside: { x: point.x, y: point.y - half } };
    case 'right': return { inside: { x: point.x - half, y: point.y }, outside: { x: point.x + half, y: point.y } };
    case 'bottom': return { inside: { x: point.x, y: point.y - half }, outside: { x: point.x, y: point.y + half } };
    case 'left': return { inside: { x: point.x + half, y: point.y }, outside: { x: point.x - half, y: point.y } };
  }
}

function center(rect: RegisteredNodeRect): RoutePoint {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

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

/**
 * Projects one Atlas Edge across the visible containment boxes. The Document
 * remains unchanged: these points are derived from current registered rects.
 * A null result asks cactus to retain its bundled direct-route fallback.
 */
export function projectAtlasEdgeRoute(
  doc: AtlasDocument,
  edge: AtlasEdge,
  rects: ReadonlyMap<string, RegisteredNodeRect>,
): EdgeRoute | null {
  return createAtlasEdgeRouter(doc)(edge, rects);
}

/** Build the document-side routing index once. The returned function remains
 * geometry-only: changing rects does not rebuild Atlas ancestry or container
 * membership for every Edge. */
function createAtlasEdgeRouter(doc: AtlasDocument) {
  const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
  const parentOf = new Map(doc.nodes.flatMap((node) => node.parent ? [[node.id, node.parent] as const] : []));
  const ancestorCache = new Map<string, string[]>();
  const ancestors = (id: string): string[] => {
    const cached = ancestorCache.get(id);
    if (cached) return cached;
    const result: string[] = [];
    let current = parentOf.get(id);
    while (current) {
      result.push(current);
      current = parentOf.get(current);
    }
    ancestorCache.set(id, result);
    return result;
  };
  for (const node of doc.nodes) ancestors(node.id);
  const containerIds = [...new Set(parentOf.values())];
  const depthById = new Map(doc.nodes.map((node) => [node.id, ancestors(node.id).length]));

  return (edge: AtlasEdge, rects: ReadonlyMap<string, RegisteredNodeRect>): EdgeRoute | null => {
  const sourceRect = rects.get(edge.from);
  const targetRect = rects.get(edge.to);
  if (!sourceRect || !targetRect) return null;

  const sourceNode = nodeById.get(edge.from);
  const targetNode = nodeById.get(edge.to);
  if (!sourceNode || !targetNode) return null;
  const sourceAncestors = ancestors(edge.from);
  const targetAncestors = ancestors(edge.to);
  const targetAncestorSet = new Set(targetAncestors);
  const lca = sourceAncestors.find((id) => targetAncestorSet.has(id));
  const sourceContainers = lca ? sourceAncestors.slice(0, sourceAncestors.indexOf(lca)) : sourceAncestors;
  const destinationContainers = lca
    ? targetAncestors.slice(0, targetAncestors.indexOf(lca)).reverse()
    : [...targetAncestors].reverse();
  if (sourceContainers.length === 0 && destinationContainers.length === 0) return null;

  const sourceCenter = center(sourceRect);
  const targetCenter = center(targetRect);
  if (sourceCenter.x === targetCenter.x && sourceCenter.y === targetCenter.y) return null;
  const sourcePorts: RoutePoint[] = [];
  for (const id of sourceContainers) {
    const rect = rects.get(id);
    const node = nodeById.get(id);
    if (!rect || !node) return null;
    const anchors = atlasPortAnchors({ ...rect, node }, node.ports?.exit ?? DEFAULT_EXIT_PORT);
    sourcePorts.push(anchors.inside, anchors.outside);
  }
  const destinationPorts: RoutePoint[] = [];
  for (const id of destinationContainers) {
    const rect = rects.get(id);
    const node = nodeById.get(id);
    if (!rect || !node) return null;
    const anchors = atlasPortAnchors({ ...rect, node }, node.ports?.entry ?? DEFAULT_ENTRY_PORT);
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
      if (rect && node && containsPoint(childArea({ ...rect, node }), midpoint)
        && (scope === undefined || (depthById.get(id) ?? 0) > (depthById.get(scope) ?? 0))) scope = id;
    }
    return scope === undefined ? -1 : 2 * (depthById.get(scope) ?? 0) + 1;
  });
  return { points: routePoints, segmentLayers };
  };
}

export interface AtlasRenderNode {
  node: AtlasNode;
  x: number;
  y: number;
  w: number;
  h: number;
  hasChildren: boolean;
  depth: number;
}

/**
 * A Node's position intent, derived from its stored fields. `manual` is
 * parent-relative, same frame as the tidy layout it overrides. The union is
 * the seam future modes (`relative`, `pinned`, …) extend.
 */
export type NodePosition =
  | { mode: 'auto' }
  | { mode: 'manual'; x: number; y: number };

export function nodePositionOf(node: AtlasNode): NodePosition {
  return node.x !== undefined && node.y !== undefined
    ? { mode: 'manual', x: node.x, y: node.y }
    : { mode: 'auto' };
}

/**
 * Node geometry for rendering: layoutAtlas's parent-relative positions resolved
 * to absolute canvas coordinates, and sizes shrink-wrapped to each node's
 * children (leaves get a constant size). Plain arithmetic over the position
 * map — no cactus layout types cross out of layout.ts.
 *
 * A Node with a stored position (`nodePositionOf` mode `manual`) overrides the
 * tidy position at that slot; an `auto` Node keeps the tidy layout. tidyLayout
 * still runs for every Node — its output is the fallback and the auto siblings'
 * source of truth — so a manual Node's relative slot can overlap an auto
 * Node's; that's the loose canvas (see the task's Do NOT list).
 */
export function projectAtlasNodes(doc: AtlasDocument): AtlasRenderNode[] {
  const tidyPositions = layoutAtlas(doc);
  const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
  const relativePositions = new Map<string, { x: number; y: number }>();
  for (const node of doc.nodes) {
    const intent = nodePositionOf(node);
    relativePositions.set(
      node.id,
      intent.mode === 'manual' ? { x: intent.x, y: intent.y } : (tidyPositions.get(node.id) ?? { x: 0, y: 0 }),
    );
  }
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const node of doc.nodes) {
    if (node.parent === undefined) continue;
    parentOf.set(node.id, node.parent);
    if (!childrenOf.has(node.parent)) childrenOf.set(node.parent, []);
    childrenOf.get(node.parent)!.push(node.id);
  }

  // The fold (resolveAbsolutePositionByParentOf) walks parent chains adding
  // each level's relative position, so a child's stored/tidy slot must be
  // offset into its parent's child area here — sizeOf above deliberately
  // reads the un-offset relativePositions instead, to avoid double-counting.
  // Each parent's own header override (if any) governs its own children's
  // offset, so the origin is looked up per parent rather than once globally.
  const foldPositions = new Map<string, { x: number; y: number }>();
  for (const [id, pos] of relativePositions) {
    const parentId = parentOf.get(id);
    if (parentId === undefined) {
      foldPositions.set(id, pos);
      continue;
    }
    const origin = childAreaOrigin(nodeById.get(parentId));
    foldPositions.set(id, { x: pos.x + origin.x, y: pos.y + origin.y });
  }

  // sizeOf measures children in their raw (un-offset) relative frame — the
  // header/padding inset is added by the formula below, not baked into
  // relativePositions, so the two don't double-count.
  const sizes = new Map<string, { w: number; h: number }>();
  function sizeOf(id: string): { w: number; h: number } {
    const cached = sizes.get(id);
    if (cached) return cached;
    const children = childrenOf.get(id) ?? [];
    const node = nodeById.get(id);
    let size: { w: number; h: number };
    if (children.length === 0) {
      size = { w: leafWidth(node), h: leafHeight(node) };
    } else {
      let maxX = 0;
      let maxY = 0;
      for (const childId of children) {
        const pos = relativePositions.get(childId) ?? { x: 0, y: 0 };
        const childSize = sizeOf(childId);
        maxX = Math.max(maxX, pos.x + childSize.w);
        maxY = Math.max(maxY, pos.y + childSize.h);
      }
      size = shrinkWrapSize(node, maxX, maxY);
    }
    sizes.set(id, size);
    return size;
  }

  function depthOf(id: string): number {
    let depth = 0;
    let current = parentOf.get(id);
    while (current) {
      depth++;
      current = parentOf.get(current);
    }
    return depth;
  }

  // Parents must precede children in render order so overlapping children
  // (drawn later in the DOM) stack visually above their container.
  const ordered = [...doc.nodes].sort((a, b) => depthOf(a.id) - depthOf(b.id));

  return ordered.map((node) => {
    const abs = resolveAbsolutePositionByParentOf(node.id, foldPositions, parentOf);
    const size = sizeOf(node.id);
    return {
      node,
      x: abs.x,
      y: abs.y,
      w: size.w,
      h: size.h,
      hasChildren: (childrenOf.get(node.id) ?? []).length > 0,
      depth: depthOf(node.id),
    };
  });
}
