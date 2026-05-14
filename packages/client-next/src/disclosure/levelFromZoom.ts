import type { DisclosureLevel, View } from '@luminous/core';

const DEFAULT_THRESHOLDS: Array<{ minZoom: number; level: DisclosureLevel }> = [
  { minZoom: 0,   level: 'peek' },
  { minZoom: 0.4, level: 'card' },
  { minZoom: 1.2, level: 'open' },
  { minZoom: 3.0, level: 'deep' },
];

export function levelFromZoom(
  zoom: number,
  zoomToLevel: View['zoomToLevel'],
): DisclosureLevel {
  const thresholds = (zoomToLevel && zoomToLevel.length > 0)
    ? [...zoomToLevel].sort((a, b) => a.minZoom - b.minZoom)
    : DEFAULT_THRESHOLDS;

  // Walk from highest minZoom downward; return first entry whose minZoom <= zoom.
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (thresholds[i].minZoom <= zoom) {
      return thresholds[i].level;
    }
  }
  // zoom is below the smallest threshold — return the smallest entry's level.
  return thresholds[0].level;
}
