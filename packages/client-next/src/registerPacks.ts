import { registerPack, getPack } from '@luminous/canvas-core';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';
import primitivesPack from '@luminous/pack-primitives';

let registered = false;
export function ensurePacksRegistered(): void {
  if (registered) return;
  if (!getPack(rtpStatechartPack.id)) registerPack(rtpStatechartPack);
  if (!getPack(primitivesPack.id)) registerPack(primitivesPack);
  registered = true;
}
