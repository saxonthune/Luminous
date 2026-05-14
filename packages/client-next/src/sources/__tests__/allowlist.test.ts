import { describe, it, expect } from 'vitest';
import { isVisibleSource } from '../allowlist';

describe('isVisibleSource', () => {
  it('allows the known allowlisted path', () => {
    expect(isVisibleSource('rtp-statechart.canvas.json')).toBe(true);
  });

  it('rejects an unknown path', () => {
    expect(isVisibleSource('some-other.canvas.json')).toBe(false);
  });

  it('rejects a path that is a substring of an allowlisted path', () => {
    expect(isVisibleSource('rtp-statechart')).toBe(false);
  });
});
