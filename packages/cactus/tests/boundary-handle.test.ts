import { describe, expect, it } from 'vitest';
import { boundaryPoint, projectToBoundary } from '../src/BoundaryHandle.tsx';

describe('boundary handle geometry', () => {
  const rect = { x: 10, y: 20, w: 100, h: 50 };

  it('maps every side and normalized offset to its center point', () => {
    expect(boundaryPoint(rect, { side: 'top', offset: 0.5 })).toEqual({ x: 60, y: 20 });
    expect(boundaryPoint(rect, { side: 'right', offset: 0.5 })).toEqual({ x: 110, y: 45 });
    expect(boundaryPoint(rect, { side: 'bottom', offset: 0.5 })).toEqual({ x: 60, y: 70 });
    expect(boundaryPoint(rect, { side: 'left', offset: 0.5 })).toEqual({ x: 10, y: 45 });
  });

  it('clamps rendered centers for a fixed-size handle without changing placement data', () => {
    expect(boundaryPoint(rect, { side: 'top', offset: 0 }, 24, 10)).toEqual({ x: 22, y: 20 });
    expect(boundaryPoint(rect, { side: 'left', offset: 1 }, 24, 10)).toEqual({ x: 10, y: 65 });
  });

  it('projects to the nearest side and crosses corners', () => {
    expect(projectToBoundary(rect, { x: 80, y: 18 })).toEqual({ side: 'top', offset: 0.7 });
    expect(projectToBoundary(rect, { x: 114, y: 60 })).toEqual({ side: 'right', offset: 0.8 });
  });
});
