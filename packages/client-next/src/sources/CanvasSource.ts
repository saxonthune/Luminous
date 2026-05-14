export interface CanvasSource {
  id: string;
  label: string;
  load: () => Promise<string>;
}
