/** Above overview but below full editing, Nodes preserve structure and identity
 * while secondary content withdraws. Focus temporarily restores that content. */
export const MERINO_STRUCTURAL_ZOOM = 0.85;
export const MERINO_OVERVIEW_ZOOM = 0.65;

export function merinoSecondaryContentVisible(zoom: number, focused: boolean): boolean {
  return zoom >= MERINO_STRUCTURAL_ZOOM
    || (focused && zoom >= MERINO_OVERVIEW_ZOOM);
}
