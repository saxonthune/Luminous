/** Above overview but below full editing, Nodes preserve structure and identity
 * while secondary content withdraws. Focus temporarily restores that content. */
export const MERINO_STRUCTURAL_ZOOM = 0.85;
export const MERINO_OVERVIEW_ZOOM = 0.65;

export type MerinoNodeRepresentation = 'full' | 'compact' | 'mark' | 'hidden';

export interface MerinoNodeRepresentationInput {
  zoom: number;
  screenWidth: number;
  screenHeight: number;
  isContainer: boolean;
  focused: boolean;
}

export function merinoSecondaryContentVisible(zoom: number, focused: boolean): boolean {
  return zoom >= MERINO_STRUCTURAL_ZOOM
    || (focused && zoom >= MERINO_OVERVIEW_ZOOM);
}

/** Choose a complete semantic representation rather than independently hiding
 * pieces of a full card. Containers remain visible as structural regions in
 * overview; leaves become categorical marks only while their projected
 * footprint is still large enough to communicate location and type. */
export function merinoNodeRepresentation(input: MerinoNodeRepresentationInput): MerinoNodeRepresentation {
  if (merinoSecondaryContentVisible(input.zoom, input.focused)) return 'full';
  if (input.zoom >= MERINO_OVERVIEW_ZOOM) return 'compact';
  if (input.isContainer) return 'mark';

  return Math.min(input.screenWidth, input.screenHeight) >= 6
    && Math.max(input.screenWidth, input.screenHeight) >= 10
    ? 'mark'
    : 'hidden';
}
