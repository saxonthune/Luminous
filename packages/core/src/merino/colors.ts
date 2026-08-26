/** Merino's color palette — the same eight hue-agnostic theme slots Atlas uses,
 * named independently so a Node Type or Edge Type stores a Merino token, not an
 * Atlas one. The client maps each token to a `--color-merino-<token>` CSS var. */
export const MERINO_COLOR_TOKENS = [
  'accent-1', 'accent-2', 'accent-3', 'accent-4',
  'accent-5', 'accent-6', 'accent-7', 'accent-8',
] as const;

export type MerinoColorToken = (typeof MERINO_COLOR_TOKENS)[number];

export function isMerinoColorToken(v: unknown): v is MerinoColorToken {
  return typeof v === 'string' && (MERINO_COLOR_TOKENS as readonly string[]).includes(v);
}
