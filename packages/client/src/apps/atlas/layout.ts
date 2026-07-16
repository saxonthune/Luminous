// Layout is a placeholder pending the relation-based layout language (doc01.07).
// This function is the seam the relation solver replaces: AtlasDocument in,
// positions out, no cactus types crossing the boundary. This is the only file
// in the app allowed to import from @luminous/cactus's layout modules or name
// TidyNode.
import type { AtlasDocument } from '@luminous/core/atlas';
import { tidyLayout, type TidyNode } from '@luminous/cactus';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;

export function layoutAtlas(doc: AtlasDocument): Map<string, { x: number; y: number }> {
  const nodes: TidyNode[] = doc.nodes.map((node) => ({
    id: node.id,
    w: NODE_WIDTH,
    h: NODE_HEIGHT,
    parentId: node.parent ?? null,
  }));
  const result = tidyLayout(nodes);
  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, rect] of result) {
    positions.set(id, { x: rect.x, y: rect.y });
  }
  return positions;
}
