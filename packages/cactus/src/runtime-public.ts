/** Rendering and interaction entry point for pre-laid-out graphs.
 * Keep layout engines out of this dependency graph; generators use ./layout. */
import './env.d.ts';
export { Canvas } from './Canvas.js';
export type { CanvasProps, CanvasRef } from './Canvas.js';
export { NodeContainer } from './NodeContainer.js';
export { DotGrid } from './DotGrid.js';
export { ResizeHandle } from './ResizeHandle.js';
export { useCanvasContext } from './CanvasContext.js';
export { useGesture } from './interactions/useGesture.js';
export { stopWheelIfScrollable } from './interactions/scroll.js';
export type { EdgeDeclaration } from './types.js';
