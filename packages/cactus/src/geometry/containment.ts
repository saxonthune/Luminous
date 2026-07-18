// Re-export geometry functions for backwards compat
export { computeBounds, isPointInRect } from './geometry.js';
export type { Rect, ComputeBoundsOptions } from './geometry.js';

import { isPointInRect } from './geometry.js';

/**
 * Whether a screen point falls within a node's `[data-soft-container]`
 * interior — the drawn container box, not the header/frame around it. The
 * interior element itself is `pointer-events: none` (NodeContainer.tsx), so
 * it never receives the native hit-test; callers instead pass the node's own
 * element (found via `closest('[data-container-id]')` or `currentTarget`)
 * and this measures the interior's rendered rect directly.
 *
 * Returns false for a leaf node (no `[data-soft-container]` descendant) —
 * so this also doubles as "is this node a container being pressed on its
 * interior."
 */
export function isOverContainerInterior(nodeEl: Element, clientX: number, clientY: number): boolean {
  const interior = nodeEl.querySelector('[data-soft-container]');
  if (!interior) return false;
  const rect = interior.getBoundingClientRect();
  return isPointInRect({ x: clientX, y: clientY }, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
}

/**
 * Hit-test for drop targets using DOM data attributes.
 * Looks for elements with data-drop-target="true" and data-container-id.
 *
 * @param screenX - Screen X coordinate
 * @param screenY - Screen Y coordinate
 * @param exclude - Container IDs to skip, e.g. the node being dragged, which is
 *   itself a drop target directly under the pointer.
 * @returns Container ID if found, null otherwise
 */
export function findContainerAt(
  screenX: number,
  screenY: number,
  exclude?: ReadonlySet<string>
): string | null {
  const elements = document.elementsFromPoint(screenX, screenY);
  const targetElement = elements.find((el) => {
    if (!(el.hasAttribute('data-drop-target') && el.getAttribute('data-drop-target') === 'true')) return false;
    const id = el.getAttribute('data-container-id');
    return !(id !== null && exclude?.has(id));
  }) as HTMLElement | undefined;

  if (targetElement) {
    const containerId = targetElement.getAttribute('data-container-id');
    return containerId;
  }

  return null;
}
