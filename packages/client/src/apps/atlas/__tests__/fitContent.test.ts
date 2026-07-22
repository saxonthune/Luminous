import { describe, it, expect } from 'vitest';
import {
  measureContentFit,
  buildFitPatch,
  buildClearSizePatch,
  buildAutoFitPatch,
} from '../fitContent.ts';

const FIT = { width: 300, height: 200 };

describe('buildFitPatch (R72)', () => {
  it('writes only the grip axes', () => {
    expect(buildFitPatch({ horizontal: true, vertical: false }, FIT)).toEqual({ contentWidth: 300 });
    expect(buildFitPatch({ horizontal: false, vertical: true }, FIT)).toEqual({ contentHeight: 200 });
  });

  it('the corner grip writes both axes', () => {
    expect(buildFitPatch({ horizontal: true, vertical: true }, FIT)).toEqual({
      contentWidth: 300,
      contentHeight: 200,
    });
  });
});

describe('buildClearSizePatch (R73)', () => {
  it('clears via key-present-with-undefined, only on the grip axes', () => {
    const patch = buildClearSizePatch({ horizontal: true, vertical: false });
    // core's setNode reads `'contentWidth' in patch` to decide clearing, so
    // the key must be present even though its value is undefined.
    expect('contentWidth' in patch).toBe(true);
    expect(patch.contentWidth).toBeUndefined();
    expect('contentHeight' in patch).toBe(false);
  });
});

describe('buildAutoFitPatch (R74 — manual beats auto, per axis)', () => {
  it('fits both axes for a Node with no stored size', () => {
    expect(buildAutoFitPatch({}, FIT)).toEqual({ contentWidth: 300, contentHeight: 200 });
  });

  it('never overrides a stored axis, and fits the other', () => {
    expect(buildAutoFitPatch({ contentWidth: 400 }, FIT)).toEqual({ contentHeight: 200 });
    expect(buildAutoFitPatch({ contentHeight: 100 }, FIT)).toEqual({ contentWidth: 300 });
  });

  it('writes nothing for a fully user-sized Node', () => {
    expect(buildAutoFitPatch({ contentWidth: 400, contentHeight: 100 }, FIT)).toEqual({});
  });
});

describe('measureContentFit', () => {
  it('returns null for a Node without Content', () => {
    expect(measureContentFit(undefined)).toBeNull();
  });

  it('returns null when no layout engine is available (jsdom all-zero rects)', () => {
    expect(measureContentFit({ text: 'const x = 1;', mode: 'code' })).toBeNull();
  });

  it('leaves no measurement host behind in the document', () => {
    const before = document.body.childElementCount;
    measureContentFit({ text: 'hello', mode: 'markdown' });
    expect(document.body.childElementCount).toBe(before);
  });
});
