import { describe, expect, it } from 'vitest';
import type { NylonDocument } from '@luminous/core/nylon';
import { buildGhostNodes } from '../NylonViewportChrome.tsx';
import { projectNylon } from '@luminous/core/nylon/projection';
import {
  NYLON_VIEW_POLICY,
  canvasViewport,
  containerDragLocked,
  relativeZoom,
  relativeZoomTier,
  showsSecondaryNodeContent,
} from '../viewportPolicy.ts';

describe('Nylon viewport policy', () => {
  it('derives Relative Zoom from the larger viewport coverage axis', () => {
    expect(relativeZoom({ x: 0, y: 0, w: 400, h: 100 }, 1, { width: 800, height: 800 })).toBe(0.5);
    expect(relativeZoomTier(NYLON_VIEW_POLICY.contextMinRelativeZoom - 0.01)).toBe('overview');
    expect(relativeZoomTier(NYLON_VIEW_POLICY.contextMinRelativeZoom)).toBe('working');
    expect(relativeZoomTier(NYLON_VIEW_POLICY.closeRelativeZoom)).toBe('close');
  });

  it('uses the close tier to lock container dragging', () => {
    const viewport = { width: 1000, height: 800 };
    expect(containerDragLocked({ x: 0, y: 0, w: 910, h: 100 }, 1, viewport)).toBe(false);
    expect(containerDragLocked({ x: 0, y: 0, w: 920, h: 100 }, 1, viewport)).toBe(true);
  });

  it('culls secondary content by projected screen capacity', () => {
    const rect = { x: 0, y: 0, w: 180, h: 180 };
    expect(showsSecondaryNodeContent(rect, 1)).toBe(true);
    expect(showsSecondaryNodeContent(rect, 0.3)).toBe(false);
  });

  it('converts the camera transform into a canvas-space viewport', () => {
    expect(canvasViewport({ x: -100, y: -50, k: 2 }, { width: 800, height: 600 }))
      .toEqual({ x: 50, y: 25, w: 400, h: 300 });
  });

  it('projects a selected Node incoming off-screen Contract as a Ghost Node', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [{ id: 'step', name: 'Step', x: 200, y: 150 }],
      contracts: [{ id: 'remote', name: 'Remote settings', kind: 'options', x: 700, y: 180 }],
      arcs: [{ from: 'remote', to: 'step' }],
    };
    const ghosts = buildGhostNodes(
      doc,
      projectNylon(doc),
      'step',
      { x: 0, y: 0, k: 1 },
      { width: 500, height: 400 },
    );

    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ id: 'remote', name: 'Remote settings', kind: 'options' });
    expect(ghosts[0].x).toBeLessThan(500 - NYLON_VIEW_POLICY.ghostWidth);
  });
});
