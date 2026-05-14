import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';

export interface ElkLayoutInput {
  rootIds: ReadonlyArray<string>;
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Arrow edges between spatial nodes — used to drive layered layout. */
  edges: ReadonlyArray<{ id: string; from: string; to: string }>;
  /** Per-node intrinsic size; falls back to default. */
  sizeOf?: ReadonlyMap<string, { w: number; h: number }>;
  defaultNodeSize?: { w: number; h: number };
  direction?: 'RIGHT' | 'DOWN';
  /** Header reservation at the top of each container so children don't overlap title. */
  headerHeight?: number;
}

export interface ElkLayoutOutput {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  sizes: ReadonlyMap<string, { w: number; h: number }>;
}

function buildElkNode(
  id: string,
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>,
  sizeOf: ReadonlyMap<string, { w: number; h: number }> | undefined,
  defaultSize: { w: number; h: number },
  headerHeight: number,
): ElkNode {
  const children = childrenOf.get(id) ?? [];
  const size = sizeOf?.get(id);

  if (children.length === 0) {
    return {
      id,
      width: size?.w ?? defaultSize.w,
      height: size?.h ?? defaultSize.h,
    };
  }

  const minW = size?.w ?? 200;
  const minH = size?.h ?? 120;

  return {
    id,
    width: minW,
    height: minH,
    layoutOptions: {
      'elk.padding': `[top=${headerHeight},left=8,right=8,bottom=8]`,
    },
    children: children.map((cid) =>
      buildElkNode(cid, childrenOf, sizeOf, defaultSize, headerHeight)
    ),
  };
}

function collectPositionsAndSizes(
  node: ElkNode,
  positions: Map<string, { x: number; y: number }>,
  sizes: Map<string, { w: number; h: number }>,
): void {
  if (node.x !== undefined && node.y !== undefined) {
    positions.set(node.id, { x: node.x, y: node.y });
  }
  if (node.width !== undefined && node.height !== undefined) {
    sizes.set(node.id, { w: node.width, h: node.height });
  }
  for (const child of node.children ?? []) {
    collectPositionsAndSizes(child, positions, sizes);
  }
}

export async function elkLayout(input: ElkLayoutInput): Promise<ElkLayoutOutput> {
  const {
    rootIds,
    childrenOf,
    edges,
    sizeOf,
    defaultNodeSize = { w: 120, h: 60 },
    direction = 'RIGHT',
    headerHeight = 24,
  } = input;

  const elk = new ELK();

  // Collect all node IDs in the graph for edge filtering
  const allNodeIds = new Set<string>();
  function collectIds(id: string): void {
    allNodeIds.add(id);
    for (const cid of childrenOf.get(id) ?? []) {
      collectIds(cid);
    }
  }
  for (const rid of rootIds) collectIds(rid);

  const filteredEdges = edges.filter(
    (e) => allNodeIds.has(e.from) && allNodeIds.has(e.to)
  );

  const graph: ElkNode = {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '50',
    },
    children: rootIds.map((rid) =>
      buildElkNode(rid, childrenOf, sizeOf, defaultNodeSize, headerHeight)
    ),
    edges: filteredEdges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const result = await elk.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { w: number; h: number }>();

  for (const child of result.children ?? []) {
    collectPositionsAndSizes(child, positions, sizes);
  }

  return { positions, sizes };
}
