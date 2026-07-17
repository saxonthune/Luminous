import type { AtlasDocument, AtlasEdge, AtlasNode } from '@luminous/core/atlas';
import type { EdgeDeclaration } from '@luminous/cactus';
import { resolveAbsolutePositionByParentOf } from '@luminous/cactus';
import { layoutAtlas } from './layout.ts';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
const CONTAINER_PADDING = 10;
export const CONTAINER_HEADER = 72; // reserved band for a container's own content, absent an override
/** Floor on a dragged `contentHeight`, so the resize handle can't collapse a Node to nothing. */
export const MIN_CONTENT_HEIGHT = 40;

/** A container's header-band height: its stored override, else the fixed constant. */
export function containerHeaderHeight(node?: AtlasNode): number {
  return node?.contentHeight ?? CONTAINER_HEADER;
}

/** A leaf's whole-box height: its stored override, else the fixed constant. */
export function leafHeight(node?: AtlasNode): number {
  return node?.contentHeight ?? NODE_HEIGHT;
}

/** Parent-relative: where a container's children begin, inside its own rect. */
export function childAreaOrigin(node?: AtlasNode): { x: number; y: number } {
  return { x: CONTAINER_PADDING, y: containerHeaderHeight(node) };
}

/** The absolute child-area rect of a container render node — its own rect
 * shrunk by the header band (the node's own override, else the fixed
 * constant) and padding on every other side. */
export function childArea(rn: { x: number; y: number; w: number; h: number; node?: AtlasNode }): { x: number; y: number; w: number; h: number } {
  const header = containerHeaderHeight(rn.node);
  return {
    x: rn.x + CONTAINER_PADDING,
    y: rn.y + header,
    w: rn.w - 2 * CONTAINER_PADDING,
    h: rn.h - header - CONTAINER_PADDING,
  };
}

/**
 * The Ctrl-drag live-expand preview: for `path` (self-and-ancestors, bottom-up
 * — `selfAndAncestors(draggingId, parentOf)`), the size each ancestor would
 * have if the dragged Node (path[0]) moved by `(dx, dy)` and stayed a member.
 * Mirrors `sizeOf`'s bounding-box formula (`projectAtlasNodes` above), but
 * walks only the path — O(depth), substituting the path-child's live extent
 * (its committed extent, grown by `dx`/`dy` at the bottom level and by its own
 * already-computed live size above that) in place of its committed one.
 *
 * A negative `dx`/`dy` (dragging up/left) is clamped to 0: shrinking the
 * union or shifting a container's origin is out of scope (see the task's "Do
 * NOT" list) — this only ever grows a size, never shrinks it below committed.
 */
export function liveAncestorSizes(
  renderNodes: { node: AtlasNode; x: number; y: number; w: number; h: number }[],
  path: string[],
  dx: number,
  dy: number,
): Map<string, { w: number; h: number }> {
  const live = new Map<string, { w: number; h: number }>();
  if (path.length < 2) return live;

  const byId = new Map(renderNodes.map((rn) => [rn.node.id, rn]));
  const childrenOf = new Map<string, string[]>();
  for (const rn of renderNodes) {
    if (rn.node.parent === undefined) continue;
    const list = childrenOf.get(rn.node.parent) ?? [];
    list.push(rn.node.id);
    childrenOf.set(rn.node.parent, list);
  }

  const effDx = Math.max(0, dx);
  const effDy = Math.max(0, dy);

  let pathChildId = path[0]!;
  let pathChildW = byId.get(pathChildId)?.w ?? 0;
  let pathChildH = byId.get(pathChildId)?.h ?? 0;

  for (let i = 1; i < path.length; i++) {
    const ancestorId = path[i]!;
    const ancestorRn = byId.get(ancestorId);
    if (!ancestorRn) break;
    const origin = childAreaOrigin(ancestorRn.node);
    let maxX = 0;
    let maxY = 0;
    for (const childId of childrenOf.get(ancestorId) ?? []) {
      const childRn = byId.get(childId);
      if (!childRn) continue;
      const isPathChild = childId === pathChildId;
      const grow = isPathChild && i === 1;
      const rawX = childRn.x - ancestorRn.x - origin.x + (grow ? effDx : 0);
      const rawY = childRn.y - ancestorRn.y - origin.y + (grow ? effDy : 0);
      const w = isPathChild ? pathChildW : childRn.w;
      const h = isPathChild ? pathChildH : childRn.h;
      maxX = Math.max(maxX, rawX + w);
      maxY = Math.max(maxY, rawY + h);
    }
    const size = {
      w: Math.max(NODE_WIDTH, maxX + 2 * CONTAINER_PADDING),
      h: containerHeaderHeight(ancestorRn.node) + maxY + CONTAINER_PADDING,
    };
    live.set(ancestorId, size);
    pathChildId = ancestorId;
    pathChildW = size.w;
    pathChildH = size.h;
  }
  return live;
}

function edgeId(edge: AtlasEdge, i: number): string {
  return `${edge.from}->${edge.to}-${i}`;
}

export function toEdgeDeclarations(doc: AtlasDocument): EdgeDeclaration[] {
  return doc.edges.map((edge, i) => ({
    id: edgeId(edge, i),
    sourceId: edge.from,
    targetId: edge.to,
    labelText: edge.label,
    styling: { arrowHead: true, dash: 'solid' },
  }));
}

export interface AtlasRenderNode {
  node: AtlasNode;
  x: number;
  y: number;
  w: number;
  h: number;
  hasChildren: boolean;
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
      size = { w: NODE_WIDTH, h: leafHeight(node) };
    } else {
      let maxX = 0;
      let maxY = 0;
      for (const childId of children) {
        const pos = relativePositions.get(childId) ?? { x: 0, y: 0 };
        const childSize = sizeOf(childId);
        maxX = Math.max(maxX, pos.x + childSize.w);
        maxY = Math.max(maxY, pos.y + childSize.h);
      }
      size = { w: Math.max(NODE_WIDTH, maxX + 2 * CONTAINER_PADDING), h: containerHeaderHeight(node) + maxY + CONTAINER_PADDING };
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
    };
  });
}
