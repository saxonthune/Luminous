import type { DenimEdge, DenimGraph, DenimNode, DenimNodeType } from './database.ts';

export interface DenimExportPoint {
  x: number;
  y: number;
}

export interface DenimExcalidrawDocument {
  type: 'excalidraw';
  version: 2;
  source: 'https://excalidraw.com';
  elements: Record<string, unknown>[];
  appState: { viewBackgroundColor: string };
  files: Record<string, never>;
}

const NODE_WIDTH = 232;
const NODE_HEIGHT = 142;
const FONT_FAMILY = 2;
const NODE_COLORS_BY_THEME_SLOT: Record<number, string> = {
  1: '#e2e8f0',
  2: '#e3ebe3',
  4: '#fef3c7',
  5: '#ede9fe',
  6: '#e0e7ff',
  8: '#ffe4e6',
};
const FALLBACK_NODE_COLOR = '#f3f4f6';
const EDGE_COLOR = '#64748b';

function elementId(prefix: string, id: string): string {
  return `${prefix}-${encodeURIComponent(id)}`;
}

function seed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function baseElement(id: string, type: string, x: number, y: number, width: number, height: number): Record<string, unknown> {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: '#343a40',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: seed(id),
    version: 1,
    versionNonce: seed(`${id}:version`),
    isDeleted: false,
    boundElements: null as { id: string; type: string }[] | null,
    updated: 0,
    link: null,
    locked: false,
    created: null,
  };
}

function nodeElements(
  node: DenimNode,
  position: DenimExportPoint,
  connectedEdges: { id: string; type: 'arrow' }[],
  themeSlot: number,
): Record<string, unknown>[] {
  const shapeId = elementId('node', node.id);
  const textId = elementId('label', node.id);
  const shape = baseElement(shapeId, 'rectangle', position.x, position.y, NODE_WIDTH, NODE_HEIGHT);
  shape.backgroundColor = NODE_COLORS_BY_THEME_SLOT[themeSlot] ?? FALLBACK_NODE_COLOR;
  shape.boundElements = [{ id: textId, type: 'text' }, ...connectedEdges];
  const text = {
    ...baseElement(textId, 'text', position.x + 12, position.y + 12, NODE_WIDTH - 24, NODE_HEIGHT - 24),
    text: `${node.type}\n${node.text}`,
    originalText: `${node.type}\n${node.text}`,
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    textAlign: 'center',
    verticalAlign: 'middle',
    containerId: shapeId,
    lineHeight: 1.25,
    autoResize: false,
  };
  return [shape, text];
}

function edgeElement(edge: DenimEdge, nodes: Map<string, DenimNode>, positions: ReadonlyMap<string, DenimExportPoint>): Record<string, unknown> | undefined {
  const source = positions.get(edge.sourceId);
  const target = positions.get(edge.targetId);
  if (!source || !target || !nodes.has(edge.sourceId) || !nodes.has(edge.targetId)) return;
  const x1 = source.x + NODE_WIDTH / 2;
  const y1 = source.y + NODE_HEIGHT / 2;
  const x2 = target.x + NODE_WIDTH / 2;
  const y2 = target.y + NODE_HEIGHT / 2;
  const id = elementId('edge', edge.id);
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const element = baseElement(id, 'arrow', left, top, Math.abs(x2 - x1), Math.abs(y2 - y1));
  element.strokeColor = EDGE_COLOR;
  element.boundElements = [];
  element.points = [[x1 - left, y1 - top], [x2 - left, y2 - top]];
  element.startBinding = { elementId: elementId('node', edge.sourceId), focus: 0, gap: 1, fixedPoint: null };
  element.endBinding = { elementId: elementId('node', edge.targetId), focus: 0, gap: 1, fixedPoint: null };
  element.startArrowhead = null;
  element.endArrowhead = 'triangle';
  return element;
}

/** Convert a Board's loaded graph and canvas positions to an editable Excalidraw scene. */
export function denimBoardToExcalidraw(
  graph: DenimGraph,
  positions: ReadonlyMap<string, DenimExportPoint>,
  nodeTypes: readonly DenimNodeType[] = [],
): DenimExcalidrawDocument {
  const themeSlots = new Map(nodeTypes.map((type) => [type.name, type.themeSlot]));
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.flatMap((edge) => {
    const converted = edgeElement(edge, nodes, positions);
    return converted ? [converted] : [];
  });
  const connectedEdges = new Map<string, { id: string; type: 'arrow' }[]>();
  for (const edge of graph.edges) {
    if (!positions.has(edge.sourceId) || !positions.has(edge.targetId)
      || !nodes.has(edge.sourceId) || !nodes.has(edge.targetId)) continue;
    const reference = { id: elementId('edge', edge.id), type: 'arrow' as const };
    for (const nodeId of [edge.sourceId, edge.targetId]) {
      const references = connectedEdges.get(nodeId) ?? [];
      references.push(reference);
      connectedEdges.set(nodeId, references);
    }
  }
  const shapes = graph.nodes.flatMap((node) => {
    const position = positions.get(node.id);
    return position ? nodeElements(node, position, connectedEdges.get(node.id) ?? [], themeSlots.get(node.type) ?? 1) : [];
  });
  return {
    type: 'excalidraw',
    version: 2,
    source: 'https://excalidraw.com',
    elements: [...edges, ...shapes],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
}
