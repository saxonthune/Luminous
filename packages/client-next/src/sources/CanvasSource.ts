export interface CanvasSource {
  id: string;
  label: string;
  /** Grouping key — which workspace/repo this canvas belongs to. */
  root: string;
  load: () => Promise<string>;
}
