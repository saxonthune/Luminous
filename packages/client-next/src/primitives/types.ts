import type { Component } from 'solid-js'
import type { PrimitiveDef } from '../api'

/**
 * Props passed to every primitive renderer.
 *
 * - `value` and `onChange` are present for content-bearing primitives (title, markdown).
 *   For structural primitives (drag-bar, container) they may be undefined.
 * - `nodeId` is the id of the node this primitive belongs to. Used by drag-bar
 *   to display the id badge and by container to identify which children to render.
 * - `children` is a Solid JSX fragment passed by the caller, used by container
 *   primitives to render the node's actual children.
 */
export interface PrimitiveProps {
  primitive: PrimitiveDef
  nodeId: string
  value?: unknown
  onChange?: (next: unknown) => void
  children?: import('solid-js').JSX.Element
}

export type PrimitiveRenderer = Component<PrimitiveProps>
