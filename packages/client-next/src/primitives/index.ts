import type { PrimitiveRenderer } from './types'
import { DragBarRenderer } from './DragBarRenderer'
import { TitleRenderer } from './TitleRenderer'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ContainerRenderer } from './ContainerRenderer'

export type { PrimitiveProps, PrimitiveRenderer } from './types'
export { DragBarRenderer, TitleRenderer, MarkdownRenderer, ContainerRenderer }

/**
 * Registry of primitive renderers, keyed by `PrimitiveDef.type`.
 * Adding a new primitive type means writing the renderer and adding one entry here.
 */
export const primitiveRenderers: Record<string, PrimitiveRenderer> = {
  'drag-bar':  DragBarRenderer,
  'title':     TitleRenderer,
  'markdown':  MarkdownRenderer,
  'container': ContainerRenderer,
}
