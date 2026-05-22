import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import type { LayoutRequest, LayoutResult } from './layout-types.js';

export type { LayoutRequest, LayoutResult };

export interface ElkLayoutOptions {
  direction?: 'RIGHT' | 'DOWN';
  opaqueContainers?: ReadonlySet<string>;
  /** Multiplier applied to all inter-node spacing. 1 = default density. */
  spacing?: number;
}

function buildElkNode(
  id: string,
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>,
  nodeSizes: ReadonlyMap<string, { w: number; h: number }> | undefined,
  defaultSize: { w: number; h: number },
  headerHeight: number,
  headerHeights?: ReadonlyMap<string, number>,
  opaqueContainers?: ReadonlySet<string>,
): ElkNode {
  const children = childrenOf.get(id) ?? [];
  const size = nodeSizes?.get(id);

  if (children.length === 0 || opaqueContainers?.has(id)) {
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
      buildElkNode(cid, childrenOf, nodeSizes, defaultSize, headerHeight, headerHeights, opaqueContainers)
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
  const opaqueContainers = opts?.opaqueContainers;

  // Spacing multiplier: scaling the spacing constants keeps ELK's node ordering
  // (crossing minimization is deterministic for the same graph), so the layout
  // spreads out without changing its arrangement.
  const spacing = opts?.spacing ?? 1;
  const s = (base: number) => String(Math.round(base * spacing));

  const elk = new ELK();

  // Collect node IDs that actually appear in the ELK graph. Opaque containers
  // are leaves to ELK — buildElkNode omits their descendants — so we must not
  // descend into them here, or edges to hidden children would reference shapes
  // ELK never received ("Referenced shape does not exist").
  const allNodeIds = new Set<string>();
  function collectIds(id: string): void {
    allNodeIds.add(id);
    if (opaqueContainers?.has(id)) return;
    for (const cid of childrenOf.get(id) ?? []) {
      collectIds(cid);
    }
  }
  for (const rid of rootIds) collectIds(rid);

  // Map any node that lives inside an opaque container to that container, so
  // edges touching hidden descendants attach to the visible opaque box.
  const remap = new Map<string, string>();
  function mapDescendants(opaqueId: string, target: string): void {
    for (const cid of childrenOf.get(opaqueId) ?? []) {
      remap.set(cid, target);
      mapDescendants(cid, target);
    }
  }
  for (const oc of opaqueContainers ?? []) mapDescendants(oc, oc);

  const resolve = (id: string): string => remap.get(id) ?? id;

  const filteredEdges = edges
    .map((e) => ({ ...e, from: resolve(e.from), to: resolve(e.to) }))
    .filter((e) => allNodeIds.has(e.from) && allNodeIds.has(e.to) && e.from !== e.to);

  const graph: ElkNode = {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.spacing.nodeNodeBetweenLayers': s(50),
      'elk.spacing.nodeNode': s(20),
      'elk.layered.spacing.edgeNodeBetweenLayers': s(20),
      'elk.spacing.componentComponent': s(40),
      'elk.spacing.edgeNode': s(20),
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.edgeLabel': '6',
      'elk.edgeLabels.inline': 'false',
      // Crossing reduction: layer-sweep only reorders nodes within their
      // existing layers, so this untangles edges without changing the layout's
      // overall flow. thoroughness is the main lever (default 7).
      'elk.layered.thoroughness': '70',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.semiInteractive': 'false',
      'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
    },
    children: rootIds.map((rid) =>
      buildElkNode(rid, childrenOf, nodeSizes, defaultNodeSize, headerHeight, headerHeights, opaqueContainers)
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
