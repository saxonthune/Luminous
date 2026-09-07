import { describe, expect, it } from 'vitest';
import { placeRectAtCandidates } from '../src/geometry/candidatePlacement.ts';

describe('placeRectAtCandidates', () => {
  it('uses the first collision-free candidate', () => {
    const result = placeRectAtCandidates(
      { width: 40, height: 30 },
      [{ x: 50, y: 50 }, { x: 120, y: 50 }],
      [{ x: 20, y: 20, width: 60, height: 60 }],
      { gap: 10 },
    );
    expect(result).toMatchObject({ x: 100, y: 35, candidateIndex: 1, overlapArea: 0 });
  });

  it('keeps a fitting result inside its bounds', () => {
    const result = placeRectAtCandidates(
      { width: 40, height: 30 },
      [{ x: -100, y: 400 }],
      [],
      { bounds: { x: 10, y: 20, width: 100, height: 80 } },
    );
    expect(result).toMatchObject({ x: 10, y: 70, overflowArea: 0 });
  });

  it('chooses the least-overlapping candidate when none is clear', () => {
    const result = placeRectAtCandidates(
      { width: 40, height: 40 },
      [{ x: 30, y: 30 }, { x: 90, y: 30 }],
      [
        { x: 0, y: 0, width: 60, height: 60 },
        { x: 80, y: 20, width: 20, height: 20 },
      ],
    );
    expect(result.candidateIndex).toBe(1);
    expect(result.overlapArea).toBeLessThan(1600);
  });

  it('allows a rectangle to straddle a soft boundary when half remains inside', () => {
    const result = placeRectAtCandidates(
      { width: 40, height: 40 },
      [{ x: 0, y: 50 }, { x: -15, y: 50 }, { x: 50, y: 50 }],
      [{ x: 30, y: 30, width: 40, height: 40 }],
      {
        containment: {
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          minFraction: 0.5,
        },
      },
    );
    expect(result).toMatchObject({ candidateIndex: 0, containmentFraction: 0.5, containmentDeficit: 0 });
  });
});
