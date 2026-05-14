/**
 * Pure container operations for the canvas engine.
 * No React hooks, no DOM, no Yjs — just coordinate math.
 *
 * All functions use structural typing so CartaNode[] can be passed directly
 * without explicit mapping.
 */

import {
  toAbsolutePosition,
  toRelativePosition,
  computeOrganizerFit,
  type NodeGeometry,
  type OrganizerLayoutConfig,
  type OrganizerFitResult,
  DEFAULT_ORGANIZER_LAYOUT,
} from './geometry.js';

/** Minimal node interface — CartaNode satisfies this structurally. */
export interface ContainerNode {
  id: string;
  parentId?: string;
  position: { x: number; y: number };
}

export interface ContainerFitConfig {
  layout?: OrganizerLayoutConfig;
}

/**
 * Resolve absolute position by walking parent chain.
 * Returns the node's position in canvas coordinates.
 */
export function resolveAbsolutePosition(
  nodeId: string,
  nodes: ContainerNode[]
): { x: number; y: number } {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return { x: 0, y: 0 };
  if (!node.parentId) return node.position;

  const parent = nodes.find(n => n.id === node.parentId);
  if (!parent) return node.position;

  const parentAbs = resolveAbsolutePosition(parent.id, nodes);
  return toAbsolutePosition(node.position, parentAbs);
}

/**
 * Compute the relative position for attaching a node to a container.
 * Preserves the node's absolute canvas position.
 *
 * @returns The position the node should have relative to the container.
 */
export function computeAttach(
  nodeId: string,
  containerId: string,
  nodes: ContainerNode[]
): { x: number; y: number } {
  const containerAbs = resolveAbsolutePosition(containerId, nodes);
  const nodeAbs = resolveAbsolutePosition(nodeId, nodes);
  return toRelativePosition(nodeAbs, containerAbs);
}

/**
 * Compute the absolute position for detaching a node from its container.
 * Preserves the node's absolute canvas position.
 *
 * @returns The position the node should have in canvas coordinates.
 */
export function computeDetach(
  nodeId: string,
  nodes: ContainerNode[]
): { x: number; y: number } {
  return resolveAbsolutePosition(nodeId, nodes);
}

/**
 * Resolve absolute position using external parentOf and positions maps.
 * Unlike resolveAbsolutePosition, this does not read from a ContainerNode array —
 * it reads from the maps produced by gridLayout and ContainmentTree.
 *
 * When the parent id is not found in positions, returns the node's own position
 * and logs a warning.
 */
export function resolveAbsolutePositionByParentOf(
  nodeId: string,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  parentOf: ReadonlyMap<string, string>
): { x: number; y: number } {
  const pos = positions.get(nodeId);
  if (!pos) return { x: 0, y: 0 };

  const parentId = parentOf.get(nodeId);
  if (!parentId) return { x: pos.x, y: pos.y };

  if (!positions.has(parentId)) {
    console.warn(
      `resolveAbsolutePositionByParentOf: parent "${parentId}" of node "${nodeId}" not found in positions; returning own position`
    );
    return { x: pos.x, y: pos.y };
  }

  const parentAbs = resolveAbsolutePositionByParentOf(parentId, positions, parentOf);
  return { x: parentAbs.x + pos.x, y: parentAbs.y + pos.y };
}

/**
 * Compute patches for fitting a container to its children.
 *
 * @param childGeometries - Pre-computed visual footprints of children
 *   (caller handles wagon expansion via getChildVisualFootprints).
 * @param config - Optional layout config (padding, headerHeight).
 * @returns The OrganizerFitResult with positionDelta, size, and childPositionDelta.
 */
export function computeContainerFit(
  childGeometries: NodeGeometry[],
  config?: ContainerFitConfig
): OrganizerFitResult {
  return computeOrganizerFit(childGeometries, config?.layout ?? DEFAULT_ORGANIZER_LAYOUT);
}
