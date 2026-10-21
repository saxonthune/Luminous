import { dagLayout, type EdgeContentOverlay, type TidyNode } from '@luminous/cactus';
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
  | { kind: 'sequence'; id: string; sourceId: string; targetId: string; priority: number | null; contentOverlays: EdgeContentOverlay[] }
  | { kind: 'container-owner'; id: string; sourceId: string; targetId: string; routeBand: number }
  | { kind: 'detached-containment'; id: string; sourceId: string; targetId: string };

export interface DenimCanvasModel {
  positions: Map<string, { x: number; y: number }>;
  nodeDepths: Map<string, number>;
  nodeContainers: Map<string, string[]>;
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
}): Pick<DenimCanvasModel, 'nodeDepths' | 'nodeContainers' | 'containerDepths'> {
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
  const nodeContainers = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    const point = positions.get(nodeId);
    if (!point) { nodeDepths.set(nodeId, 0); nodeContainers.set(nodeId, []); continue; }
    const cx = point.x + nodeWidth / 2;
    const cy = point.y + nodeHeight / 2;
    let depth = 0;
    const containing: string[] = [];
    for (const [headNodeId, box] of entries) {
      if (headNodeId === nodeId) continue;
      if (areaContainsPoint(box, cx, cy)) {
        depth = Math.max(depth, (containerDepths.get(headNodeId) ?? 0) + 1);
        containing.push(headNodeId);
      }
    }
    nodeDepths.set(nodeId, depth);
    nodeContainers.set(nodeId, containing);
  }
  return { nodeDepths, nodeContainers, containerDepths };
}

function containerParentIndex(graph: DenimGraph): Map<string, string> {
  return new Map(graph.edges.filter((edge) => edge.type === 'contains')
    .map((edge) => [edge.targetId, edge.sourceId]));
}

function dataContainerAncestors(parentByMember: ReadonlyMap<string, string>, nodeId: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>([nodeId]);
  let parent = parentByMember.get(nodeId);
  while (parent && !seen.has(parent)) {
    result.push(parent);
    seen.add(parent);
    parent = parentByMember.get(parent);
  }
  return result;
}

function edgeContentOverlays(input: {
  edge: Pick<DenimEdge, 'sourceId' | 'targetId'>;
  parentByMember: ReadonlyMap<string, string>;
  containers: DenimBoard['containers'];
  nodeContainers: ReadonlyMap<string, readonly string[]>;
  containerDepths: ReadonlyMap<string, number>;
  headerHeight: number;
}): EdgeContentOverlay[] {
  const { edge, parentByMember, containers, nodeContainers, containerDepths, headerHeight } = input;
  const visualByNode = new Map<string, Set<string>>([
    [edge.sourceId, new Set(nodeContainers.get(edge.sourceId) ?? [])],
    [edge.targetId, new Set(nodeContainers.get(edge.targetId) ?? [])],
  ]);
  const relevant = new Set([
    ...(nodeContainers.get(edge.sourceId) ?? []),
    ...(nodeContainers.get(edge.targetId) ?? []),
    ...dataContainerAncestors(parentByMember, edge.sourceId),
    ...dataContainerAncestors(parentByMember, edge.targetId),
  ]);
  const endpointsInContainer = (containerId: string) => [...visualByNode.values()].some((ids) => ids.has(containerId));
  return [...relevant]
    .filter((containerId) => containers[containerId] && endpointsInContainer(containerId))
    .sort((a, b) => (containerDepths.get(a) ?? 0) - (containerDepths.get(b) ?? 0))
    .flatMap((containerId) => {
      const container = containers[containerId];
      const contentHeight = container.height - headerHeight;
      if (contentHeight <= 0) return [];
      return [{
        band: 3 + 2 * (containerDepths.get(containerId) ?? 0),
        clipRect: { x: container.x, y: container.y + headerHeight, w: container.width, h: contentHeight },
      }];
    });
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
  const savedPositions = graph.nodes.flatMap((node) => {
    const position = board.positions[node.id];
    return position ? [[node.id, position] as const] : [];
  });
  const positions = savedPositions.length === graph.nodes.length
    ? new Map(savedPositions)
    : dagLayout(nodes, graph.edges
      .filter((edge) => edge.type === 'parent-child')
      .map((edge) => ({ source: edge.sourceId, target: edge.targetId })));
  for (const [id, position] of Object.entries(board.positions)) positions.set(id, position);

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const visualDepths = deriveVisualDepths({
    positions,
    containers: board.containers,
    nodeIds: graph.nodes.map((node) => node.id),
    nodeWidth,
    nodeHeight,
    containerHeaderHeight,
  });
  const containerParents = containerParentIndex(graph);
  const edges: DenimCanvasEdge[] = graph.edges
    .filter((edge) => edge.type === 'parent-child')
    .map((edge) => ({
      kind: 'sequence', id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId,
      priority: edge.priority,
      contentOverlays: edgeContentOverlays({ edge, parentByMember: containerParents, containers: board.containers,
        nodeContainers: visualDepths.nodeContainers, containerDepths: visualDepths.containerDepths,
        headerHeight: containerHeaderHeight }),
    }));
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

/** Apply transient Container drag positions without re-deriving depths or Edges.
 * Cactus holds the last routed Edge geometry until the drag ends. */
export function previewDenimContainerDrag(input: {
  model: DenimCanvasModel;
  preview: DenimContainerDragPreview | null;
}): DenimCanvasModel {
  const { model, preview } = input;
  if (!preview) return model;
  const positions = new Map(model.positions);
  for (const id of preview.carriedNodeIds) {
    const point = positions.get(id);
    if (point) positions.set(id, { x: point.x + preview.dx, y: point.y + preview.dy });
  }
  return { ...model, positions };
}
