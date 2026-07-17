export const ATLAS_COLOR_TOKENS = [
  'slate', 'moss', 'deep-moss', 'ochre', 'violet', 'indigo', 'oxide', 'rose',
] as const;

export type AtlasColorToken = (typeof ATLAS_COLOR_TOKENS)[number];

export function isAtlasColorToken(v: unknown): v is AtlasColorToken {
  return typeof v === 'string' && (ATLAS_COLOR_TOKENS as readonly string[]).includes(v);
}
