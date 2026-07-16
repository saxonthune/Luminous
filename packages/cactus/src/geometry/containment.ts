// Re-export geometry functions for backwards compat
export { computeBounds, isPointInRect } from './geometry.js';
export type { Rect, ComputeBoundsOptions } from './geometry.js';

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
