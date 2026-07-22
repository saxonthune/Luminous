// Fit-to-content sizing (doc01.07.04 R72-R74): a one-shot, event-driven
// measurement — never a continuous constraint — so sizing can't oscillate.
// Content is measured off-canvas at zoom 1, once, and the result is written
// to the Document as an ordinary undoable setNode; ancestors then grow
// through the existing shrink-wrap chain (projection.ts).
import { marked } from 'marked';
import type { AtlasContentMode, AtlasNode } from '@luminous/core/atlas';
import { MIN_CONTENT_HEIGHT, MIN_CONTENT_WIDTH } from './projection.ts';
import type { ContentResizeDirection } from './AtlasNodeContent.tsx';

/** The shape `measureContentFit` needs — the text a Node draws (Filled or
 * authored, per `resolveContent`) plus its Mode. Callers pass a resolved
 * Content's `{ text, mode }`, not the authored `AtlasContent` directly, so a
 * Filled Node fits to what it actually shows (R82). */
export interface FitContentInput {
  text: string;
  mode: AtlasContentMode;
}

/** Ceilings on a fitted size — a long unbroken code line widens the Node to
 * readable, not to absurd, and a giant block scrolls past the height cap. */
export const MAX_FIT_WIDTH = 560;
export const MAX_FIT_HEIGHT = 640;

// The box chrome around the measured content element, mirroring
// AtlasNodeContent's read-mode markup: the root's p-2 (16px) plus the content
// band's border (2px) horizontally; vertically also the header row (~24px)
// and the gap-1 (4px) between it and the band. The measurement host itself
// carries the band's inner p-1 pb-3 padding, so it is not counted here.
const FIT_CHROME_W = 18;
const FIT_CHROME_H = 46;

export interface FitSize {
  width: number;
  height: number;
}

/** A setNode-shaped size patch. An axis key present with `undefined` clears
 * the stored size (core's setNode reads `'contentWidth' in patch`). */
export interface SizePatch {
  contentWidth?: number;
  contentHeight?: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Measures the whole-box size a leaf Node needs to show `content` without
 * scrolling, within the MIN/MAX bounds. Renders the content off-canvas with
 * the same classes AtlasNodeContent uses, at max-content width clamped to
 * the cap, then reads the wrapped height at that width — one pass, so a
 * width↔height wrap feedback loop is impossible.
 *
 * Returns `null` when there is nothing to measure or no layout engine is
 * available (jsdom reports all-zero rects) — callers then skip the fit.
 */
export function measureContentFit(content: FitContentInput | undefined): FitSize | null {
  if (content === undefined || typeof document === 'undefined') return null;

  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.visibility = 'hidden';
  host.style.width = 'max-content';
  host.style.maxWidth = `${MAX_FIT_WIDTH - FIT_CHROME_W}px`;
  // Mirror of the content band's scroll div padding (AtlasNodeContent).
  host.className = 'p-1 pb-3';

  if (content.mode === 'code') {
    const pre = document.createElement('pre');
    pre.className = 'whitespace-pre-wrap break-words rounded p-1 font-mono text-[10px]';
    pre.textContent = content.text;
    host.appendChild(pre);
  } else {
    const div = document.createElement('div');
    div.className = 'atlas-node-md text-xs';
    // SECURITY: marked does not sanitize HTML; atlas documents are
    // author-controlled workspace files, same trust class as graph data
    // (see AtlasNodeContent.tsx). The host is visibility:hidden and removed
    // synchronously.
    div.innerHTML = marked.parse(content.text, { async: false }) as string;
    host.appendChild(div);
  }

  document.body.appendChild(host);
  const rect = host.getBoundingClientRect();
  host.remove();

  if (rect.width === 0 && rect.height === 0) return null;
  return {
    width: clamp(Math.ceil(rect.width) + FIT_CHROME_W, MIN_CONTENT_WIDTH, MAX_FIT_WIDTH),
    height: clamp(Math.ceil(rect.height) + FIT_CHROME_H, MIN_CONTENT_HEIGHT, MAX_FIT_HEIGHT),
  };
}

/** The explicit fit command's patch (R72): the grip's axes are written even
 * over a user-set size — the double click is the user asking. */
export function buildFitPatch(dir: ContentResizeDirection, fit: FitSize): SizePatch {
  const patch: SizePatch = {};
  if (dir.horizontal) patch.contentWidth = fit.width;
  if (dir.vertical) patch.contentHeight = fit.height;
  return patch;
}

/** The fit command's patch for a Container or a contentless leaf (R73):
 * clears the stored size on the grip's axes, returning the Node to its
 * computed size (shrink-wrap for a Container, the default constants for a
 * contentless leaf). */
export function buildClearSizePatch(dir: ContentResizeDirection): SizePatch {
  const patch: SizePatch = {};
  if (dir.horizontal) patch.contentWidth = undefined;
  if (dir.vertical) patch.contentHeight = undefined;
  return patch;
}

/** The edit-commit auto-fit patch (R74): only axes the user has never set —
 * a stored size is manual and always beats the measured fit. */
export function buildAutoFitPatch(
  node: Pick<AtlasNode, 'contentWidth' | 'contentHeight'> | undefined,
  fit: FitSize,
): SizePatch {
  const patch: SizePatch = {};
  if (node?.contentWidth === undefined) patch.contentWidth = fit.width;
  if (node?.contentHeight === undefined) patch.contentHeight = fit.height;
  return patch;
}
