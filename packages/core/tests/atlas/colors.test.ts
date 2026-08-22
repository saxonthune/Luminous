import { describe, it, expect } from 'vitest';
import { ATLAS_COLOR_TOKENS, isAtlasColorToken } from '../../src/atlas/colors.ts';

describe('isAtlasColorToken', () => {
  it('accepts every member of ATLAS_COLOR_TOKENS', () => {
    for (const token of ATLAS_COLOR_TOKENS) {
      expect(isAtlasColorToken(token)).toBe(true);
    }
  });

  it('rejects a non-member string', () => {
    expect(isAtlasColorToken('chartreuse')).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(isAtlasColorToken(42)).toBe(false);
  });
});
