import type { AtlasDocument, AtlasEdge, AtlasNode } from '@luminous/core/atlas';
import type { EdgeDeclaration } from '@luminous/cactus';
import { resolveAbsolutePositionByParentOf } from '@luminous/cactus';
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
  return doc.edges.map((edge, i) => ({
    id: edgeId(edge, i),
    sourceId: edge.from,
    targetId: edge.to,
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
    };
  });
}
