import { deserializePack } from './parsePackJson.ts';
import type { Pack } from '../types.ts';
import primitivesData from '../../packs/primitives.pack.json' with { type: 'json' };

let cachedPrimitives: Pack | undefined;

/** Return the shipped primitives pack. Parsed once and cached. */
export function getPrimitivesBuiltin(): Pack {
  if (!cachedPrimitives) {
    cachedPrimitives = deserializePack(primitivesData);
  }
  return cachedPrimitives;
}
