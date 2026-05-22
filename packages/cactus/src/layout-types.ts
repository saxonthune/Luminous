export interface LayoutRequest {
  rootIds: ReadonlyArray<string>;
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Measured intrinsic size per node (leaf size / container header band). */
  nodeSizes?: ReadonlyMap<string, { w: number; h: number }>;
  defaultNodeSize?: { w: number; h: number };
  headerHeight?: number;
  headerHeights?: ReadonlyMap<string, number>;
  edges: ReadonlyArray<{
    id: string;
    from: string;
    to: string;
    label?: { w: number; h: number };
  }>;
  /** Per-parent layout choice. Key is a parent node id. Unset parents default to 'pack'. */
  layoutPolicy?: ReadonlyMap<string, 'pack' | 'grid'>;
  /** Per-node soft layering hints. Lower = closer to layout start. */
  layerHints?: ReadonlyMap<string, number>;
}

export interface LayoutResult {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  sizes: ReadonlyMap<string, { w: number; h: number }>;
}
