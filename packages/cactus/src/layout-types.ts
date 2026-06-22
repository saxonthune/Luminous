export interface LayoutRequest {
  rootIds: ReadonlyArray<string>;
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Measured intrinsic size per node (leaf size / container header band). */
  nodeSizes?: ReadonlyMap<string, { w: number; h: number }>;
  defaultNodeSize?: { w: number; h: number };
  headerHeight?: number;
  headerHeights?: ReadonlyMap<string, number>;
  /** Per-container minimum width from the container's own visible content (e.g.
   * the rendered card). Used so a container that renders wide content is sized
   * to fit that content even when its children pack narrower. */
  headerWidths?: ReadonlyMap<string, number>;
  edges: ReadonlyArray<{
    id: string;
    from: string;
    to: string;
    label?: { w: number; h: number };
  }>;
  /** Per-parent layout choice. Key is a parent node id. Unset parents default to 'pack'.
   * 'stack-v' and 'stack-h' place children in childrenOf order as a single column or row. */
  layoutPolicy?: ReadonlyMap<string, 'pack' | 'grid' | 'stack-v' | 'stack-h'>;
  /** Per-node soft layering hints. Lower = closer to layout start. */
  layerHints?: ReadonlyMap<string, number>;
}

export interface LayoutResult {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  sizes: ReadonlyMap<string, { w: number; h: number }>;
}
