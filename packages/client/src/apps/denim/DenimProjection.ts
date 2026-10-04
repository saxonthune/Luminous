import { dagLayout, type TidyNode } from '@luminous/cactus';
import type { DenimBoard } from '@luminous/core/denim/actions';
import type { DenimEdge, DenimGraph } from '@luminous/core/denim';

export interface DenimContainerDragPreview {
  headNodeId: string;
  dx: number;
  dy: number;
  carriedNodeIds: string[];
  carriedContainerIds: string[];
}

export type DenimCanvasEdge =
  | { kind: 'sequence'; id: string; sourceId: string; targetId: string; priority: number | null }
  | { kind: 'container-owner'; id: string; sourceId: string; targetId: string }
  | { kind: 'detached-containment'; id: string; sourceId: string; targetId: string };

export interface DenimCanvasModel {
  positions: Map<string, { x: number; y: number }>;
  edges: DenimCanvasEdge[];
}

/**
 * Derive Denim's stable visual canvas model from the current Board and graph.
 * This function is deliberately Solid and DOM independent, so the returned
 * model can be rendered or inspected without mounting a component. Transient
 * gesture geometry is applied separately by previewDenimContainerDrag.
 */
export function deriveDenimCanvasModel(input: {
  graph: DenimGraph;
  board: DenimBoard;
  nodeWidth: number;
  nodeHeight: number;
  containerHeaderHeight: number;
}): DenimCanvasModel {
  const { graph, board, nodeWidth, nodeHeight, containerHeaderHeight } = input;
  const parents = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.type === 'parent-child' && !parents.has(edge.targetId)) parents.set(edge.targetId, edge.sourceId);
  }
  const nodes: TidyNode[] = graph.nodes.map((node) => ({
    id: node.id,
    w: nodeWidth,
    h: nodeHeight,
    parentId: parents.get(node.id) ?? null,
  }));
  const layoutEdges = graph.edges
    .filter((edge) => edge.type === 'parent-child')
    .map((edge) => ({ source: edge.sourceId, target: edge.targetId }));
  const positions = dagLayout(nodes, layoutEdges);
  for (const [id, position] of Object.entries(board.positions)) positions.set(id, position);

  const edges: DenimCanvasEdge[] = graph.edges
    .filter((edge) => edge.type === 'parent-child')
    .map((edge) => ({
      kind: 'sequence', id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId,
      priority: edge.priority,
    }));

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const headNodeId of Object.keys(board.containers)) {
    if (!nodeIds.has(headNodeId)) continue;
    edges.push({
      kind: 'container-owner', id: `denim-container-link:${headNodeId}`,
      sourceId: headNodeId, targetId: `denim-container:${headNodeId}`,
    });
  }

  for (const edge of graph.edges) {
    if (edge.type !== 'contains') continue;
    const container = board.containers[edge.sourceId];
    const point = positions.get(edge.targetId);
    if (!container || !point) continue;
    const overlaps = point.x < container.x + container.width && point.x + nodeWidth > container.x
      && point.y < container.y + container.height && point.y + nodeHeight > container.y + containerHeaderHeight;
    if (overlaps) continue;
    edges.push({
      kind: 'detached-containment', id: `denim-detached:${edge.id}`,
      sourceId: `denim-container:${edge.sourceId}`, targetId: edge.targetId,
    });
  }

  return { positions, edges };
}

/** Derive the labels shown on priority Edges without rerunning graph layout. */
export function deriveDenimSequenceLabels(
  graph: DenimGraph,
  board: DenimBoard,
  editingSequenceParent: string | null,
): Map<string, string> {
  const grouped = new Map<string, DenimEdge[]>();
  for (const edge of graph.edges) {
    if (edge.type !== 'parent-child' || edge.priority === null || edge.priority === undefined) continue;
    const siblings = grouped.get(edge.sourceId) ?? [];
    siblings.push(edge);
    grouped.set(edge.sourceId, siblings);
  }
  const labels = new Map<string, string>();
  for (const [parentId, siblings] of grouped) {
    const mode = editingSequenceParent === parentId ? 'priority' : board.sequenceModes[parentId] ?? 'rank';
    const ordered = [...siblings].sort((a, b) => a.priority! - b.priority! || a.targetId.localeCompare(b.targetId));
    for (const [index, edge] of ordered.entries()) {
      labels.set(edge.id, mode === 'priority' ? String(edge.priority) : String(index + 1));
    }
  }
  return labels;
}

/** Apply transient Container drag geometry without rerunning automatic layout. */
export function previewDenimContainerDrag(input: {
  model: DenimCanvasModel;
  graph: DenimGraph;
  board: DenimBoard;
  nodeWidth: number;
  nodeHeight: number;
  containerHeaderHeight: number;
  preview: DenimContainerDragPreview | null;
}): DenimCanvasModel {
  const { model, graph, board, nodeWidth, nodeHeight, containerHeaderHeight, preview } = input;
  if (!preview) return model;
  const positions = new Map(model.positions);
  for (const id of preview.carriedNodeIds) {
    const point = positions.get(id);
    if (point) positions.set(id, { x: point.x + preview.dx, y: point.y + preview.dy });
  }
  const edges: DenimCanvasEdge[] = model.edges.filter((edge) => edge.kind !== 'detached-containment');
  for (const edge of graph.edges) {
    if (edge.type !== 'contains') continue;
    const container = board.containers[edge.sourceId];
    const point = positions.get(edge.targetId);
    if (!container || !point) continue;
    const movesWithDraggedContainer = preview.headNodeId === edge.sourceId || preview.carriedContainerIds.includes(edge.sourceId);
    const containerX = container.x + (movesWithDraggedContainer ? preview.dx : 0);
    const containerY = container.y + (movesWithDraggedContainer ? preview.dy : 0);
    const overlaps = point.x < containerX + container.width && point.x + nodeWidth > containerX
      && point.y < containerY + container.height && point.y + nodeHeight > containerY + containerHeaderHeight;
    if (!overlaps) edges.push({
      kind: 'detached-containment', id: `denim-detached:${edge.id}`,
      sourceId: `denim-container:${edge.sourceId}`, targetId: edge.targetId,
    });
  }
  const edgeMembershipUnchanged = edges.length === model.edges.length
    && edges.every((edge, index) => edge.kind === model.edges[index].kind
      && edge.id === model.edges[index].id
      && edge.sourceId === model.edges[index].sourceId
      && edge.targetId === model.edges[index].targetId);
  return { positions, edges: edgeMembershipUnchanged ? model.edges : edges };
}
