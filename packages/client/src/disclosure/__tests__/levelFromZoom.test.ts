import { describe, it, expect } from 'vitest';
import { levelFromZoom } from '../levelFromZoom';

describe('levelFromZoom', () => {
  it('uses defaults when zoomToLevel is undefined', () => {
    expect(levelFromZoom(0.2, undefined)).toBe('peek');
    expect(levelFromZoom(0.4, undefined)).toBe('card');
    expect(levelFromZoom(1.5, undefined)).toBe('open');
    expect(levelFromZoom(3.5, undefined)).toBe('deep');
  });

  it('uses defaults when zoomToLevel is empty array', () => {
    expect(levelFromZoom(0.2, [])).toBe('peek');
    expect(levelFromZoom(0.4, [])).toBe('card');
  });

  it('returns peek for zoom below all thresholds (default)', () => {
    expect(levelFromZoom(0, undefined)).toBe('peek');
  });

  it('honors exact minZoom boundaries', () => {
    expect(levelFromZoom(0.4, undefined)).toBe('card');
    expect(levelFromZoom(1.2, undefined)).toBe('open');
    expect(levelFromZoom(3.0, undefined)).toBe('deep');
  });

  it('honors custom thresholds', () => {
    const map = [
      { minZoom: 0, level: 'peek' as const },
      { minZoom: 1, level: 'card' as const },
    ];
    expect(levelFromZoom(0.5, map)).toBe('peek');
    expect(levelFromZoom(1, map)).toBe('card');
    expect(levelFromZoom(99, map)).toBe('card');
  });

  it('handles unsorted input', () => {
    const map = [
      { minZoom: 1, level: 'card' as const },
      { minZoom: 0, level: 'peek' as const },
    ];
    expect(levelFromZoom(0.5, map)).toBe('peek');
    expect(levelFromZoom(1.5, map)).toBe('card');
  });

  it('returns smallest entry level when zoom is below all thresholds', () => {
    const map = [
      { minZoom: 0.5, level: 'card' as const },
      { minZoom: 2.0, level: 'open' as const },
    ];
    // zoom=0.2 is below the lowest minZoom=0.5, should return 'card' (smallest)
    expect(levelFromZoom(0.2, map)).toBe('card');
  });
});
