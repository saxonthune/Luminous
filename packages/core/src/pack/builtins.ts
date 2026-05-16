import { deserializePack } from './parsePackJson.ts';
import type { Pack } from '../types.ts';
import primitivesData from '../../packs/primitives.pack.json' with { type: 'json' };
import rtpStatechartData from '../../packs/rtp-statechart.pack.json' with { type: 'json' };

let cachedPrimitives: Pack | undefined;
let cachedRtpStatechart: Pack | undefined;

/** Return the shipped primitives pack. Parsed once and cached. */
export function getPrimitivesBuiltin(): Pack {
  if (!cachedPrimitives) {
    cachedPrimitives = deserializePack(primitivesData);
  }
  return cachedPrimitives;
}

/**
 * Return the shipped rtp-statechart pack. Parsed once and cached.
 * The canonical copy is the `.canvases/rtp-statechart.pack.json` sibling;
 * this bundled copy is the fallback used when sibling resolution fails.
 */
export function getRtpStatechartBuiltin(): Pack {
  if (!cachedRtpStatechart) {
    cachedRtpStatechart = deserializePack(rtpStatechartData);
  }
  return cachedRtpStatechart;
}
