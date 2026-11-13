export interface CanvasSize { width: number; height: number }
/** Bottom-right resize: keep the horizontal center and top edge stationary. */
export function resizedCanvas(start: CanvasSize, minimum: CanvasSize, dx: number, dy: number): CanvasSize {
  return {
    width: Math.max(minimum.width, start.width + 2 * dx),
    height: Math.max(minimum.height, start.height + dy),
  };
}
