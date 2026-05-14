import { describe, it, expect, beforeAll } from 'vitest';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';
import { loadCanvasFileFromText, resetRegistry } from '@luminous/canvas-core';
import { defaultCanvasText, defaultCanvasId } from '../defaultCanvas';
import { ensurePacksRegistered } from '../registerPacks';

describe('viewer wiring', () => {
  beforeAll(() => {
    resetRegistry();
    ensurePacksRegistered();
  });

  it('loads the bundled RTP canvas without error', () => {
    expect(defaultCanvasText.length).toBeGreaterThan(100);
    const graph = loadCanvasFileFromText(defaultCanvasText);
    expect(graph.nodes.size).toBeGreaterThan(0);
    expect(graph.edges.size).toBeGreaterThan(0);
  });

  it('canvas id derivation', () => {
    expect(defaultCanvasId).toBe('rtp-statechart');
  });

  it('rtpStatechartPack ships both views', () => {
    const ids = rtpStatechartPack.views.map((v) => v.id);
    expect(ids).toContain('statechart');
    expect(ids).toContain('concept-map');
  });
});
