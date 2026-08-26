import type { MerinoDocument, MerinoEdgeType, MerinoNode, MerinoNodeType, MerinoTab } from '@luminous/core/merino';
import type { EdgeDeclaration } from '@luminous/cactus';

export const NODE_WIDTH = 168;
/** The name-and-type header, fixed on both collapsed and expanded Nodes. */
export const NODE_HEADER_HEIGHT = 44;
/** The uniform compact height every Node keeps until it is pinned open — the
 * header plus one line of detail preview. */
export const NODE_HEIGHT = NODE_HEADER_HEIGHT + 20;
/** Extra height a pinned-open Node gains, turning the preview line into a full
 * detail body. */
export const NODE_BODY_HEIGHT = 104;
const GRID_COLS = 4;
const GRID_X = NODE_WIDTH + 48;
const GRID_Y = NODE_HEIGHT + 40;

/** A Node's drawn height: uniform unless it is pinned open (progressive
 * disclosure), when it grows to fit its detail body. */
export function nodeHeight(node: MerinoNode): number {
  return node.expanded ? NODE_HEIGHT + NODE_BODY_HEIGHT : NODE_HEIGHT;
}

export interface MerinoRenderNode {
  node: MerinoNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MerinoProjection {
  nodes: MerinoRenderNode[];
  edges: EdgeDeclaration[];
}

/** The CSS var backing a Merino color token, e.g. accent-4 → var(--color-merino-accent-4). */
export function tokenVar(token: string): string {
  return `var(--color-merino-${token})`;
}

/** Place a Node: its stored x/y when present, else a deterministic grid slot by
 * index so a freshly created Node without a position still lands somewhere sane. */
function placement(node: MerinoNode, index: number): { x: number; y: number } {
  if (node.x !== undefined && node.y !== undefined) return { x: node.x, y: node.y };
  return { x: (index % GRID_COLS) * GRID_X, y: Math.floor(index / GRID_COLS) * GRID_Y };
}

export function projectMerino(doc: MerinoDocument, tab: MerinoTab): MerinoProjection {
  const nodesOnTab = doc.nodes.filter(n => n.tab === tab);
  const idsOnTab = new Set(nodesOnTab.map(n => n.id));
  const edgeTypeById = new Map<string, MerinoEdgeType>(doc.edgeTypes.map(t => [t.id, t]));

  const nodes: MerinoRenderNode[] = nodesOnTab.map((node, i) => {
    const p = placement(node, i);
    return { node, x: p.x, y: p.y, w: NODE_WIDTH, h: nodeHeight(node) };
  });

  const edges: EdgeDeclaration[] = [];

  // The dotted parent link of a Subnode — drawn from the parent field, never an
  // authored Edge.
  for (const node of nodesOnTab) {
    if (node.parent !== undefined && idsOnTab.has(node.parent)) {
      edges.push({
        id: `sub:${node.id}`,
        sourceId: node.parent,
        targetId: node.id,
        styling: { dash: 'dotted', arrowHead: false, colorToken: 'fg-muted' },
      });
    }
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
    });
  }

  return { nodes, edges };
}

export function nodeTypeById(doc: MerinoDocument): Map<string, MerinoNodeType> {
  return new Map(doc.nodeTypes.map(t => [t.id, t]));
}
