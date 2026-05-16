import type { JSX } from 'solid-js';
import type { RenderContext } from '../types.ts';

export interface RenderNode {
  type: string;
  children?: RenderNode[];
  [prop: string]: unknown;
}

export type Primitive = (
  props: Record<string, unknown>,
  ctx: RenderContext,
  children: () => JSX.Element,
) => JSX.Element;
