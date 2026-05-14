import { registerPack, getPack } from '@luminous/canvas-core';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';

let registered = false;
export function ensurePacksRegistered(): void {
  if (registered) return;
  if (!getPack(rtpStatechartPack.id)) {
    registerPack(rtpStatechartPack);
  }
  registered = true;
}
