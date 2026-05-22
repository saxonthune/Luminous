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

/**
 * Width of one tier band in the synthetic positions we hand to ELK's
 * INTERACTIVE layerer. The exact number doesn't matter; only the *ordering*
 * of x values determines layer assignment.
 */
const TIER_BAND_PX = 1000;

function buildElkNode(
  id: string,
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>,
  nodeSizes: ReadonlyMap<string, { w: number; h: number }> | undefined,
  defaultSize: { w: number; h: number },
  headerHeight: number,
  headerHeights?: ReadonlyMap<string, number>,
  opaqueContainers?: ReadonlySet<string>,
  positionHints?: ReadonlyMap<string, number>,
): ElkNode {
  const children = childrenOf.get(id) ?? [];
  const size = nodeSizes?.get(id);
  const xHint = positionHints?.get(id);

  if (children.length === 0 || opaqueContainers?.has(id)) {
    const leaf: ElkNode = {
      id,
      width: size?.w ?? defaultSize.w,
      height: size?.h ?? defaultSize.h,
    };
    if (xHint !== undefined) {
      // Same value on both axes so this works for either RIGHT or DOWN flow —
      // the interactive layerer reads the coord along the flow direction.
      leaf.x = xHint;
      leaf.y = xHint;
    }
    return leaf;
  }

  const minW = size?.w ?? 200;
  const minH = size?.h ?? 120;
  const topPad = headerHeights?.get(id) ?? headerHeight;

  const layoutOptions: Record<string, string> = {
    'elk.padding': `[top=${topPad},left=8,right=8,bottom=8]`,
  };

  const node: ElkNode = {
    id,
    width: minW,
    height: minH,
    layoutOptions,
    children: children.map((cid) =>
      buildElkNode(cid, childrenOf, nodeSizes, defaultSize, headerHeight, headerHeights, opaqueContainers, positionHints)
    ),
  };
  if (xHint !== undefined) {
    node.x = xHint;
    node.y = xHint;
  }
  return node;
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
    layerHints,
  } = req;

  const direction = opts?.direction ?? 'RIGHT';
  const opaqueContainers = opts?.opaqueContainers;

  // INTERACTIVE layering: elkjs implements `InteractiveLayerer` (it does NOT
  // implement `layerChoiceConstraint`, despite registering the option). To
  // honor tier hints we set the layering strategy to INTERACTIVE and hand each
  // leaf an x-coordinate; the layerer assigns layers by x ordering. Nodes
  // without a hint go to (maxTier+1)*BAND so they sit after the last hinted
  // tier rather than collapsing into layer 0.
  let positionHints: ReadonlyMap<string, number> | undefined;
  let useInteractive = false;
  if (layerHints && layerHints.size > 0) {
    useInteractive = true;
    let maxTier = 0;
    for (const t of layerHints.values()) {
      if (t > maxTier) maxTier = t;
    }
    const fallbackX = (maxTier + 1) * TIER_BAND_PX;
    const positions = new Map<string, number>();
    const visit = (id: string): void => {
      const isLeaf = (childrenOf.get(id) ?? []).length === 0 || opaqueContainers?.has(id);
      if (isLeaf) {
        const hint = layerHints.get(id);
        positions.set(id, hint !== undefined ? hint * TIER_BAND_PX : fallbackX);
      }
      if (!opaqueContainers?.has(id)) {
        for (const cid of childrenOf.get(id) ?? []) visit(cid);
      }
    };
    for (const rid of rootIds) visit(rid);
    positionHints = positions;
  }

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
      'elk.layered.cycleBreaking.strategy': useInteractive ? 'INTERACTIVE' : 'GREEDY',
      ...(useInteractive
        ? { 'elk.layered.layering.strategy': 'INTERACTIVE' }
        : {}),
    },
    children: rootIds.map((rid) =>
      buildElkNode(rid, childrenOf, nodeSizes, defaultNodeSize, headerHeight, headerHeights, opaqueContainers, positionHints)
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
