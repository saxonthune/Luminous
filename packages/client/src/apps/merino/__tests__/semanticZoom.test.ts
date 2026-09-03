import { describe, expect, it } from 'vitest';
import { MERINO_STRUCTURAL_ZOOM, merinoSecondaryContentVisible } from '../semanticZoom';

describe('Merino semantic zoom', () => {
  it('shows secondary content at the editing scale', () => {
    expect(merinoSecondaryContentVisible(MERINO_STRUCTURAL_ZOOM, false)).toBe(true);
  });

  it('withdraws secondary content at the structural scale', () => {
    expect(merinoSecondaryContentVisible(MERINO_STRUCTURAL_ZOOM - 0.01, false)).toBe(false);
  });

  it('restores local detail for the current focus', () => {
    expect(merinoSecondaryContentVisible(0.7, true)).toBe(true);
  });

  it('does not restore editing chrome once overview owns identity', () => {
    expect(merinoSecondaryContentVisible(0.5, true)).toBe(false);
  });
});
