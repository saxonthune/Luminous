import { registerPack, resolvePack } from '@luminous/core';
import rtpStatechartPack from '@luminous/pack-rtp-statechart';
import primitivesPack from '@luminous/pack-primitives';

let registered = false;
export function ensurePacksRegistered(): void {
  if (registered) return;
  if (!resolvePack(rtpStatechartPack.id)) registerPack(rtpStatechartPack);
  if (!resolvePack(primitivesPack.id)) registerPack(primitivesPack);
  registered = true;
}
