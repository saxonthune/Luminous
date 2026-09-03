import type { MerinoTab } from '@luminous/core/merino';
import type { MerinoOverviewDisclosureState, MerinoOverviewZoom } from './MerinoOverview.tsx';

export const MERINO_VIEWS = ['overview', 'edit'] as const;
export type MerinoView = typeof MERINO_VIEWS[number];

/**
 * Which Tab, View, Overview zoom level, and opened Overview Cards the user is
 * looking at. This is UI state, not document state — it is retained for the life
 * of a browser tab (per open document) so switching apps and back, or a
 * development reload, does not drop the user where they were.
 */
export interface MerinoViewState {
  tab: MerinoTab;
  view: MerinoView;
  overviewZoom: MerinoOverviewZoom;
  disclosure: MerinoOverviewDisclosureState;
}

const KEY_PREFIX = 'luminous:merino:viewstate:';

export function readMerinoViewState(sourceId: string): Partial<MerinoViewState> | undefined {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + sourceId);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed as Partial<MerinoViewState> : undefined;
  } catch {
    return undefined;
  }
}

export function writeMerinoViewState(sourceId: string, state: MerinoViewState): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + sourceId, JSON.stringify(state));
  } catch {
    // Browser storage is optional; the app remains usable without it.
  }
}

export function isMerinoOverviewDisclosureState(value: unknown): value is MerinoOverviewDisclosureState {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<MerinoOverviewDisclosureState>;
  return Array.isArray(candidate.cards)
    && candidate.activeChildByParent !== null
    && typeof candidate.activeChildByParent === 'object';
}
