import type { ChildLayoutPolicy, LayoutResult } from './layout-types.js';
import { gridLayout } from './gridLayout.js';
import { elkLayout } from './elkLayout.js';

export type { LayoutResult };

export interface ComposeLayoutInput {
  rootIds: ReadonlyArray<string>;
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Measured intrinsic size per node (leaf size / container header band). */
  nodeSizes: ReadonlyMap<string, { w: number; h: number }>;
  headerHeight?: number;
  headerHeights?: ReadonlyMap<string, number>;
  headerWidths?: ReadonlyMap<string, number>;
  edges: ReadonlyArray<{
    id: string;
    from: string;
    to: string;
    label?: { w: number; h: number };
  }>;
  /** Per-container layout choice. Unset containers default to 'pack'. */
  policies: ReadonlyMap<string, ChildLayoutPolicy>;
  /** Per-node soft layering hints for the top-level algorithm. */
  layerHints?: ReadonlyMap<string, number>;
  /** Top-level arrangement of roots + opaque containers. */
  top: {
    algorithm: 'grid' | 'elk' | 'mrtree';
    direction?: 'RIGHT' | 'DOWN';
    spacing?: number;
  };
}

/**
 * The single layout solver. Composes the recursive container-interior pass
 * (grid / stack-v / stack-h, fully synchronous) with the top-level arrangement
 * pass (ELK) and returns one fully-composed layout: parent-relative positions
 * for nested nodes, absolute positions for roots, sizes for everything.
 *
 * This owns the whole composition so the domain never hand-merges two passes.
 * Every container with children is an opaque, grid-sized box to the top-level
 * pass — its size comes from the interior pass and its children are laid out by
 * the interior pass, never by ELK.
 *
 * The two phases derive from the SAME snapshot of sizes and policies, so the
 * result is internally consistent by construction: a container's box size and
 * its children's positions can never come from different passes.
 */
export async function composeLayout(input: ComposeLayoutInput): Promise<LayoutResult> {
  const {
    rootIds,
    childrenOf,
    nodeSizes,
    headerHeight,
    headerHeights,
    headerWidths,
    edges,
    policies,
    layerHints,
    top,
  } = input;

  // (1) Interior pass — synchronous. Sizes every container bottom-up from its
  // children and lays out children per the container's policy.
  const grid = gridLayout({
    rootIds,
    childrenOf,
    nodeSizes,
    headerHeight,
    headerHeights,
    headerWidths,
    edges,
    layoutPolicy: policies,
  });

  if (top.algorithm === 'grid') return grid;

  // Every container with children is opaque to the top-level pass: it appears as
  // a fixed box sized by the interior pass; its descendants are not re-laid-out.
  const opaqueContainers = new Set<string>();
  for (const [id, kids] of childrenOf) {
    if (kids.length > 0) opaqueContainers.add(id);
  }

  // Feed the interior-computed container sizes to ELK as fixed boxes; leaves keep
  // their measured sizes.
  const mergedSizes = new Map(nodeSizes);
  for (const id of opaqueContainers) {
    const sz = grid.sizes.get(id);
    if (sz) mergedSizes.set(id, sz);
  }

  // (2) Top-level pass — arrange roots + opaque containers.
  const elk = await elkLayout(
    {
      rootIds,
      childrenOf,
      edges,
      nodeSizes: mergedSizes,
      headerHeight,
      headerHeights,
      headerWidths,
      layerHints,
    },
    {
      direction: top.direction,
      opaqueContainers,
      spacing: top.spacing,
      algorithm: top.algorithm === 'mrtree' ? 'mrtree' : 'layered',
    },
  );

  // (3) Compose — interior positions for everything, then overwrite root
  // positions with the top-level absolute coordinates. Interior (parent-relative)
  // child positions are kept as-is; resolveAbsolutePositionByParentOf folds them
  // against their resolved ancestors at render time.
  const positions = new Map(grid.positions);
  for (const rootId of rootIds) {
    const elkPos = elk.positions.get(rootId);
    if (elkPos) positions.set(rootId, elkPos);
  }

  const sizes = new Map(grid.sizes);
  for (const [id, sz] of elk.sizes) {
    sizes.set(id, sz);
  }

  return { positions, sizes };
}
