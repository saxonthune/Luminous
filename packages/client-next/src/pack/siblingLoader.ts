import { parsePackJson, registerPack, getPrimitivesBuiltin } from '@luminous/core';

/** Built-in packs, used as a fallback when sibling resolution fails. */
const BUILTINS: Record<string, () => import('@luminous/core').Pack> = {
  primitives: getPrimitivesBuiltin,
};

/**
 * Given a document source ID, a pack name, and a flag for static mode, return
 * the URL to fetch the sibling pack file.
 *
 * Static: co-located in public/canvases/ under BASE_URL.
 * Server: served via /api/pack/.
 */
export function siblingPackUrl(sourceId: string, packName: string, isStatic = __GITHUB_PAGES__): string {
  const lastSlash = sourceId.lastIndexOf('/');
  const dir = lastSlash !== -1 ? sourceId.slice(0, lastSlash + 1) : '';
  if (isStatic) {
    return `${import.meta.env.BASE_URL}canvases/${dir}${packName}.pack.json`;
  }
  const siblingPath = `${dir}${packName}.pack.json`;
  return `/api/pack/${encodeURIComponent(siblingPath)}`;
}

/**
 * Peek at a graph JSON string and return the value of the "pack" field,
 * or '' if absent. Never throws — just returns '' on any error.
 */
export function peekPackName(graphText: string): string {
  try {
    const obj = JSON.parse(graphText) as Record<string, unknown>;
    return typeof obj['pack'] === 'string' ? obj['pack'] : '';
  } catch {
    return '';
  }
}

/**
 * Given a source ID and already-loaded graph text, load and register the
 * co-located pack (the caller resets the registry before each call):
 *   1. Try fetching the sibling <packName>.pack.json from the server.
 *   2. If the pack is "primitives" and the sibling 404s, use the shipped builtin.
 *   3. If the fetch fails or the pack is malformed, log and proceed
 *      (the loader will fall back to unvalidated/fallback rendering).
 *
 * Never throws.
 */
export async function loadAndRegisterSiblingPack(
  sourceId: string,
  graphText: string,
): Promise<void> {
  const packName = peekPackName(graphText);
  if (!packName) return;

  const url = siblingPackUrl(sourceId, packName);
  let text: string | null = null;

  try {
    const res = await fetch(url);
    if (res.ok) {
      text = await res.text();
    } else if (res.status !== 404) {
      console.warn(`[siblingLoader] unexpected HTTP ${res.status} fetching pack "${packName}" from ${url}`);
    }
  } catch (e) {
    console.warn(`[siblingLoader] fetch error for pack "${packName}":`, e);
  }

  // If the sibling 404'd but the pack ships as a built-in, use the shipped copy.
  if (text === null && BUILTINS[packName]) {
    try {
      registerPack(BUILTINS[packName]());
    } catch (e) {
      console.warn(`[siblingLoader] failed to register "${packName}" builtin:`, e);
    }
    return;
  }

  if (text === null) {
    console.warn(`[siblingLoader] pack "${packName}" not found at ${url}; falling back to unvalidated rendering`);
    return;
  }

  let pack;
  try {
    pack = parsePackJson(text);
  } catch (e) {
    console.warn(`[siblingLoader] pack "${packName}" is malformed:`, e);
    return;
  }

  try {
    registerPack(pack);
  } catch (e) {
    console.warn(`[siblingLoader] failed to register pack "${packName}":`, e);
  }
}
