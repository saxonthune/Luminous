export type { RenderNode, Primitive } from './types.ts';
export { registerPrimitive, getPrimitive, resetPrimitives } from './registry.ts';
export { interpretRender } from './interpret.ts';
export { generateFallbackRender } from './fallback.ts';

import './builtins.ts';
