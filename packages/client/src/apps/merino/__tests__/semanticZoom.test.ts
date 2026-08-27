import { describe, expect, it } from 'vitest';
import { MERINO_STRUCTURAL_ZOOM, merinoNodeRepresentation, merinoSecondaryContentVisible } from '../semanticZoom';

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

  it('uses one complete representation at each disclosure scale', () => {
    expect(merinoNodeRepresentation({ zoom: 1, screenWidth: 220, screenHeight: 80, isContainer: false, focused: false })).toBe('full');
    expect(merinoNodeRepresentation({ zoom: 0.7, screenWidth: 154, screenHeight: 56, isContainer: false, focused: false })).toBe('compact');
    expect(merinoNodeRepresentation({ zoom: 0.4, screenWidth: 88, screenHeight: 32, isContainer: false, focused: false })).toBe('mark');
  });

  it('keeps overview Containers as regions but culls meaningless leaf marks', () => {
    expect(merinoNodeRepresentation({ zoom: 0.2, screenWidth: 4, screenHeight: 3, isContainer: true, focused: false })).toBe('mark');
    expect(merinoNodeRepresentation({ zoom: 0.2, screenWidth: 4, screenHeight: 3, isContainer: false, focused: false })).toBe('hidden');
  });
});
