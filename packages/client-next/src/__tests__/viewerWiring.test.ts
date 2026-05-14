import { describe, it, expect, beforeAll } from 'vitest';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';
import { resetRegistry } from '@luminous/canvas-core';
import { ensurePacksRegistered } from '../registerPacks';

describe('viewer wiring', () => {
  beforeAll(() => {
    resetRegistry();
    ensurePacksRegistered();
  });

  it('rtpStatechartPack ships both views', () => {
    const ids = rtpStatechartPack.views.map((v) => v.id);
    expect(ids).toContain('statechart');
    expect(ids).toContain('concept-map');
  });
});
