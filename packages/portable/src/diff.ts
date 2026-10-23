/** Shared visual vocabulary for proposed architecture changes. */
export const diffStyles = {
  new: { label: 'New component', symbol: '+', light: { fill: '#168344', ink: '#ffffff' }, dark: { fill: '#287e4c', ink: '#ffffff' } },
  additive: { label: 'Existing component — added capability', symbol: '++', light: { fill: '#c9efd7', ink: '#145c32' }, dark: { fill: '#234b36', ink: '#bdf4d1' } },
  modified: { label: 'Existing component — changed behavior', symbol: '−+', light: { fill: '#c9efd7', ink: '#145c32', removed: '#f3c8c5', removedInk: '#8c2520' }, dark: { fill: '#234b36', ink: '#bdf4d1', removed: '#632e2c', removedInk: '#ffd5d1' } },
} as const;
export type DiffKind = keyof typeof diffStyles;
export function isDiffKind(value: unknown): value is DiffKind {
  return typeof value === 'string' && Object.hasOwn(diffStyles, value);
}
