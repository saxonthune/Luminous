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
  | { kind: 'container-owner'; id: string; sourceId: string; targetId: string; routeBand: number }
  | { kind: 'detached-containment'; id: string; sourceId: string; targetId: string };

export interface DenimCanvasModel {
  positions: Map<string, { x: number; y: number }>;
  nodeDepths: Map<string, number>;
  containerDepths: Map<string, number>;
  edges: DenimCanvasEdge[];
}

function deriveVisualDepths(input: {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  containers: DenimBoard['containers'];
  nodeIds: readonly string[];
  nodeWidth: number;
  nodeHeight: number;
  containerHeaderHeight: number;
}): Pick<DenimCanvasModel, 'nodeDepths' | 'containerDepths'> {
  const { positions, containers, nodeIds, nodeWidth, nodeHeight, containerHeaderHeight } = input;
  const entries = Object.entries(containers);
  const areaContainsPoint = (box: DenimBoard['containers'][string], x: number, y: number) =>
    x >= box.x && x <= box.x + box.width && y >= box.y + containerHeaderHeight && y <= box.y + box.height;
  const containerDepths = new Map<string, number>();
  const depthOf = (headNodeId: string, visiting = new Set<string>()): number => {
    const known = containerDepths.get(headNodeId);
    if (known !== undefined) return known;
    if (visiting.has(headNodeId)) return 0;
    const box = containers[headNodeId];
    if (!box) return 0;
    const nextVisiting = new Set(visiting).add(headNodeId);
    const cx = box.x + box.width / 2;
    const cy = box.y + (containerHeaderHeight + box.height) / 2;
    const parents = entries.filter(([otherId, outer]) => otherId !== headNodeId
      && outer.width * outer.height > box.width * box.height
      && areaContainsPoint(outer, cx, cy));
    const parent = parents.sort((a, b) => a[1].width * a[1].height - b[1].width * b[1].height)[0];
    const depth = parent ? depthOf(parent[0], nextVisiting) + 1 : 0;
    containerDepths.set(headNodeId, depth);
    return depth;
  };
  for (const [headNodeId] of entries) depthOf(headNodeId);

  const nodeDepths = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const point = positions.get(nodeId);
    if (!point) { nodeDepths.set(nodeId, 0); continue; }
    const cx = point.x + nodeWidth / 2;
    const cy = point.y + nodeHeight / 2;
    let depth = 0;
    for (const [headNodeId, box] of entries) {
      if (headNodeId === nodeId) continue;
      if (areaContainsPoint(box, cx, cy)) depth = Math.max(depth, (containerDepths.get(headNodeId) ?? 0) + 1);
    }
    nodeDepths.set(nodeId, depth);
  }
  return { nodeDepths, containerDepths };
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
  const visualDepths = deriveVisualDepths({
    positions,
    containers: board.containers,
    nodeIds: graph.nodes.map((node) => node.id),
    nodeWidth,
    nodeHeight,
    containerHeaderHeight,
  });
  for (const headNodeId of Object.keys(board.containers)) {
    if (!nodeIds.has(headNodeId)) continue;
    edges.push({
      kind: 'container-owner', id: `denim-container-link:${headNodeId}`,
      sourceId: headNodeId, targetId: `denim-container:${headNodeId}`,
      routeBand: 1 + 2 * (visualDepths.nodeDepths.get(headNodeId) ?? 0),
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

  return { positions, ...visualDepths, edges };
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
  const containers = { ...board.containers };
  for (const headNodeId of [preview.headNodeId, ...preview.carriedContainerIds]) {
    const container = containers[headNodeId];
    if (container) containers[headNodeId] = { ...container, x: container.x + preview.dx, y: container.y + preview.dy };
  }
  const visualDepths = deriveVisualDepths({
    positions,
    containers,
    nodeIds: graph.nodes.map((node) => node.id),
    nodeWidth,
    nodeHeight,
    containerHeaderHeight,
  });
  const ownerEdges = edges.map((edge) => edge.kind === 'container-owner'
    ? { ...edge, routeBand: 1 + 2 * (visualDepths.nodeDepths.get(edge.sourceId) ?? 0) }
    : edge);
  return { positions, ...visualDepths, edges: ownerEdges };
}
