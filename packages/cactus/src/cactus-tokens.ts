/**
 * The cactus theme token contract.
 *
 * This is the single source of truth for the set of CSS custom properties
 * cactus reads. Every color in cactus source must be `var(--cactus-NAME, …)`
 * where NAME appears here. Every shipped theme in `cactus-themes.css` must
 * assign a value to exactly this set — no more, no less.
 *
 * See doc02.05.05 (Theme Token Contract).
 */
export const CACTUS_TOKENS = [
  'canvas-bg',
  'fg',
  'fg-muted',
  'fg-subtle',
  'overlay',
  'surface',
  'surface-alt',
  'border',
  'border-subtle',
  'accent',
  'accent-subtle',
  'selection',
  'on-accent',
  'danger',
  'danger-subtle',
  'grid-dot',
  'resize-handle',
  'shadow-sm',
  'shadow-lg',
] as const;

export type CactusToken = (typeof CACTUS_TOKENS)[number];

/** Fully-qualified custom property name for a token, e.g. `--cactus-fg`. */
export const cactusVar = (token: CactusToken): string => `--cactus-${token}`;
