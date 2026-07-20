export const ATLAS_COLOR_TOKENS = [
  'accent-1', 'accent-2', 'accent-3', 'accent-4',
  'accent-5', 'accent-6', 'accent-7', 'accent-8',
] as const;

export type AtlasColorToken = (typeof ATLAS_COLOR_TOKENS)[number];

export function isAtlasColorToken(v: unknown): v is AtlasColorToken {
  return typeof v === 'string' && (ATLAS_COLOR_TOKENS as readonly string[]).includes(v);
}
