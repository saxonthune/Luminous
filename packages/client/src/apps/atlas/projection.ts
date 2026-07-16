import type { AtlasDocument, AtlasEdge, AtlasNode } from '@luminous/core/atlas';
import type { EdgeDeclaration } from '@luminous/cactus';
import { resolveAbsolutePositionByParentOf } from '@luminous/cactus';
import { layoutAtlas } from './layout.ts';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
const CONTAINER_PADDING = 10;

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
 * Node geometry for rendering: layoutAtlas's parent-relative positions resolved
 * to absolute canvas coordinates, and sizes shrink-wrapped to each node's
 * children (leaves get a constant size). Plain arithmetic over the position
 * map — no cactus layout types cross out of layout.ts.
 */
export function projectAtlasNodes(doc: AtlasDocument): AtlasRenderNode[] {
  const relativePositions = layoutAtlas(doc);
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const node of doc.nodes) {
    if (node.parent === undefined) continue;
    parentOf.set(node.id, node.parent);
    if (!childrenOf.has(node.parent)) childrenOf.set(node.parent, []);
    childrenOf.get(node.parent)!.push(node.id);
  }

  const sizes = new Map<string, { w: number; h: number }>();
  function sizeOf(id: string): { w: number; h: number } {
    const cached = sizes.get(id);
    if (cached) return cached;
    const children = childrenOf.get(id) ?? [];
    let size: { w: number; h: number };
    if (children.length === 0) {
      size = { w: NODE_WIDTH, h: NODE_HEIGHT };
    } else {
      let maxX = 0;
      let maxY = 0;
      for (const childId of children) {
        const pos = relativePositions.get(childId) ?? { x: 0, y: 0 };
        const childSize = sizeOf(childId);
        maxX = Math.max(maxX, pos.x + childSize.w);
        maxY = Math.max(maxY, pos.y + childSize.h);
      }
      size = { w: maxX + CONTAINER_PADDING, h: maxY + CONTAINER_PADDING };
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
    const abs = resolveAbsolutePositionByParentOf(node.id, relativePositions, parentOf);
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
