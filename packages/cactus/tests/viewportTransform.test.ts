import { describe, expect, it } from 'vitest';
import { centerTransform, focusTransform } from '../src/interactions/useViewport.js';

describe('viewport transforms', () => {
  it('centers a rect without changing zoom', () => {
    expect(centerTransform(
      { x: 5, y: 10, k: 2 },
      { width: 800, height: 600 },
      { x: 100, y: 50, width: 200, height: 100 },
    )).toEqual({ x: 0, y: 100, k: 2 });
  });

  it('centers a rect at the requested focus zoom', () => {
    expect(focusTransform(
      { width: 800, height: 600 },
      { x: 100, y: 50, width: 200, height: 100 },
      1,
    )).toEqual({ x: 200, y: 200, k: 1 });
  });
});
