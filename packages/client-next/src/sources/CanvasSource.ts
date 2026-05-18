export interface CanvasSource {
  id: string;
  label: string;
  /** Grouping key — which workspace/repo this canvas belongs to. */
  root: string;
  /** Resolved absolute directory of the root, shown under the group header. */
  rootDir?: string;
  load: () => Promise<string>;
}
