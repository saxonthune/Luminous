import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import type { LayoutRequest, LayoutResult } from './layout-types.js';

export type { LayoutRequest, LayoutResult };

export interface ElkLayoutOptions {
  direction?: 'RIGHT' | 'DOWN';
}

function buildElkNode(
  id: string,
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>,
  nodeSizes: ReadonlyMap<string, { w: number; h: number }> | undefined,
  defaultSize: { w: number; h: number },
  headerHeight: number,
  headerHeights?: ReadonlyMap<string, number>,
): ElkNode {
  const children = childrenOf.get(id) ?? [];
  const size = nodeSizes?.get(id);

  if (children.length === 0) {
    return {
      id,
      width: size?.w ?? defaultSize.w,
      height: size?.h ?? defaultSize.h,
    };
  }

  const minW = size?.w ?? 200;
  const minH = size?.h ?? 120;
  const topPad = headerHeights?.get(id) ?? headerHeight;

  return {
    id,
    width: minW,
    height: minH,
    layoutOptions: {
      'elk.padding': `[top=${topPad},left=8,right=8,bottom=8]`,
    },
    children: children.map((cid) =>
      buildElkNode(cid, childrenOf, nodeSizes, defaultSize, headerHeight, headerHeights)
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

export async function elkLayout(req: LayoutRequest, opts?: ElkLayoutOptions): Promise<LayoutResult> {
  const {
    rootIds,
    childrenOf,
    edges,
    nodeSizes,
    defaultNodeSize = { w: 120, h: 60 },
    headerHeight = 24,
    headerHeights,
  } = req;

  const direction = opts?.direction ?? 'RIGHT';

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
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.edgeLabel': '6',
      'elk.edgeLabels.inline': 'false',
    },
    children: rootIds.map((rid) =>
      buildElkNode(rid, childrenOf, nodeSizes, defaultNodeSize, headerHeight, headerHeights)
    ),
    edges: filteredEdges.map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
      labels: e.label ? [{ id: `${e.id}__lbl`, width: e.label.w, height: e.label.h }] : [],
    })),
  };

  const result = await elk.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { w: number; h: number }>();

  for (const child of result.children ?? []) {
    collectPositionsAndSizes(child, positions, sizes);
  }

  return { positions, sizes };
}
