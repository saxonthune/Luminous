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
 *   1. Try fetching the sibling <packName>.pack.json and registering it.
 *   2. On ANY failure to use the sibling — missing, a non-JSON 200 (e.g. an SPA
 *      index.html fallback served by a static host for a missing file), malformed
 *      JSON, or a registration conflict — fall back to the shipped builtin if one
 *      exists for this pack.
 *   3. If neither works, log and proceed (unvalidated/fallback rendering).
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

  // Prefer the fetched sibling. A static host (vite preview, GitHub Pages) may
  // answer a missing .pack.json with a 200 SPA fallback rather than a 404, so a
  // non-null body is not proof of a real pack — parse/register can still fail.
  // Any failure here drops through to the builtin below.
  if (text !== null) {
    try {
      registerPack(parsePackJson(text));
      return;
    } catch (e) {
      console.warn(`[siblingLoader] sibling pack "${packName}" unusable, trying builtin:`, e);
    }
  }

  if (BUILTINS[packName]) {
    try {
      registerPack(BUILTINS[packName]());
    } catch (e) {
      console.warn(`[siblingLoader] failed to register "${packName}" builtin:`, e);
    }
    return;
  }

  console.warn(`[siblingLoader] pack "${packName}" not found at ${url}; falling back to unvalidated rendering`);
}
