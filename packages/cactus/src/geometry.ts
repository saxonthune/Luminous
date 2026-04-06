/** Inlined from @carta/geometry — cactus has no monorepo dependencies. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputeBoundsOptions {
  padding?: number;
  minWidth?: number;
  minHeight?: number;
  pinnedSize?: { width: number; height: number } | null;
}

/**
 * Computes the bounding box for a container based on its children's rectangles.
 *
 * @param children - Array of child rectangles
 * @param options - Configuration for padding, minimums, and pinned size
 * @returns Bounding rectangle encompassing all children with padding
 */
export function computeBounds(children: Rect[], options?: ComputeBoundsOptions): Rect {
  const padding = options?.padding ?? 20;
  const minWidth = options?.minWidth ?? 100;
  const minHeight = options?.minHeight ?? 100;
  const pinnedSize = options?.pinnedSize ?? null;

  // If no children, return minimum size at origin
  if (children.length === 0) {
    return {
      x: 0,
      y: 0,
      width: minWidth,
      height: minHeight,
    };
  }

  // Find the axis-aligned bounding box of all children
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of children) {
    const childLeft = child.x;
    const childTop = child.y;
    const childRight = child.x + child.width;
    const childBottom = child.y + child.height;

    if (childLeft < minX) minX = childLeft;
    if (childTop < minY) minY = childTop;
    if (childRight > maxX) maxX = childRight;
    if (childBottom > maxY) maxY = childBottom;
  }

  // Apply padding
  const x = minX - padding;
  const y = minY - padding;
  let width = maxX - minX + padding * 2;
  let height = maxY - minY + padding * 2;

  // Apply minimum dimensions
  width = Math.max(width, minWidth);
  height = Math.max(height, minHeight);

  // Apply pinned size (never shrink below pinned dimensions)
  if (pinnedSize) {
    width = Math.max(width, pinnedSize.width);
    height = Math.max(height, pinnedSize.height);
  }

  return { x, y, width, height };
}

/**
 * Simple point-in-rectangle test.
 *
 * @param point - Point to test
 * @param rect - Rectangle to test against
 * @returns True if point is inside rectangle
 */
export function isPointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface OrganizerLayoutConfig {
  padding: number;
  headerHeight: number;
}

export const DEFAULT_ORGANIZER_LAYOUT: OrganizerLayoutConfig = {
  padding: 20,
  headerHeight: 40,
};

/**
 * Node-like structure for geometry calculations.
 * Compatible with React Flow Node type.
 */
export interface NodeGeometry {
  position: Position;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
}

/**
 * Result of a full organizer fit calculation.
 * Handles children that have been dragged above/left of the organizer content area.
 */
export interface OrganizerFitResult {
  /** How much to shift the organizer's position (negative = move left/up) */
  positionDelta: Position;
  /** New size for the organizer after accounting for the shift */
  size: Size;
  /** Delta to apply to ALL children's positions (= -positionDelta) */
  childPositionDelta: Position;
}

/**
 * Convert an absolute position to a position relative to a parent.
 */
export function toRelativePosition(nodePos: Position, parentPos: Position): Position {
  return {
    x: nodePos.x - parentPos.x,
    y: nodePos.y - parentPos.y,
  };
}

/**
 * Convert a relative position to an absolute position.
 */
export function toAbsolutePosition(nodePos: Position, parentPos: Position): Position {
  return {
    x: nodePos.x + parentPos.x,
    y: nodePos.y + parentPos.y,
  };
}

/**
 * Compute a full organizer refit: new size AND position/child adjustments.
 * Unlike computeMinOrganizerSize which only grows rightward/downward,
 * this handles children at negative relative positions by shifting
 * the organizer position and adjusting all children.
 *
 * Children positions are assumed to be relative to the organizer.
 */
export function computeOrganizerFit(
  children: NodeGeometry[],
  config: OrganizerLayoutConfig = DEFAULT_ORGANIZER_LAYOUT
): OrganizerFitResult {
  const noShift: OrganizerFitResult = {
    positionDelta: { x: 0, y: 0 },
    size: {
      width: config.padding * 2,
      height: config.padding * 2 + config.headerHeight,
    },
    childPositionDelta: { x: 0, y: 0 },
  };

  if (children.length === 0) return noShift;

  const idealMinX = config.padding;
  const idealMinY = config.padding + config.headerHeight;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of children) {
    const w = child.measured?.width ?? child.width ?? 200;
    const h = child.measured?.height ?? child.height ?? 100;

    minX = Math.min(minX, child.position.x);
    minY = Math.min(minY, child.position.y);
    maxX = Math.max(maxX, child.position.x + w);
    maxY = Math.max(maxY, child.position.y + h);
  }

  const shiftX = minX < idealMinX ? minX - idealMinX : 0;
  const shiftY = minY < idealMinY ? minY - idealMinY : 0;

  return {
    positionDelta: { x: shiftX || 0, y: shiftY || 0 },
    size: {
      width: maxX - shiftX + config.padding,
      height: maxY - shiftY + config.padding,
    },
    childPositionDelta: { x: (-shiftX) || 0, y: (-shiftY) || 0 },
  };
}
