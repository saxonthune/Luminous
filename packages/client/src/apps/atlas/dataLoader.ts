import type { AtlasData } from '@luminous/core/atlas';
import { parseAtlasData } from '@luminous/core/atlas';

const DOC_SUFFIX = '.atlas.json';
const DATA_SUFFIX = '.atlasdata.json';

/** The Data File path for a Document's source id — the same namespaced
 * `<rootName>/<rel>` path with the trailing `.atlas.json` replaced by
 * `.atlasdata.json`. */
export function atlasDataPathFor(sourceId: string): string {
  return sourceId.endsWith(DOC_SUFFIX)
    ? sourceId.slice(0, -DOC_SUFFIX.length) + DATA_SUFFIX
    : sourceId + DATA_SUFFIX;
}

/**
 * Load and parse the Data File sibling to `sourceId`, tolerating every kind
 * of miss the way `pack/siblingLoader.ts` does: a 404 is silent, another
 * non-ok status warns, a thrown fetch is caught, and a 200 body that fails to
 * parse is treated as absent rather than fatal. Never throws or rejects.
 */
export async function loadAtlasData(sourceId: string): Promise<AtlasData | undefined> {
  const path = atlasDataPathFor(sourceId);
  const url = __STATIC__
    ? `${import.meta.env.BASE_URL}canvases/${path}`
    : `/api/atlasdata/${encodeURIComponent(path)}`;
  let text: string | null = null;

  try {
    const res = await fetch(url);
    if (res.ok) {
      text = await res.text();
    } else if (res.status !== 404) {
      console.warn(`[dataLoader] unexpected HTTP ${res.status} fetching atlas data from ${url}`);
    }
  } catch (e) {
    console.warn(`[dataLoader] fetch error for atlas data at ${url}:`, e);
  }

  if (text === null) return undefined;

  const result = parseAtlasData(text);
  if (!result.ok) {
    console.warn(`[dataLoader] atlas data at ${url} failed to parse:`, result.issues);
    return undefined;
  }
  return result.data;
}
