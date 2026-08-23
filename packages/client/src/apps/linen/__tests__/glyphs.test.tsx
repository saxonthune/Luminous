import { describe, it, expect } from 'vitest';
import { KIND_DESCRIPTORS } from '@luminous/core/linen';
import { GLYPHS, missingGlyphIds } from '../glyphs.tsx';

describe('glyph map', () => {
  it('covers every descriptor kind', () => {
    expect(missingGlyphIds()).toEqual([]);
    for (const descriptor of KIND_DESCRIPTORS) {
      expect(GLYPHS[descriptor.glyph], `glyph for ${descriptor.kind}`).toBeDefined();
    }
  });
});
