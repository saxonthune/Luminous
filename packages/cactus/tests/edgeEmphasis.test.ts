import { describe, it, expect } from 'vitest';
import { edgeEmphasis } from '../src/EdgeLayer.js';

const edge = { sourceId: 'a', targetId: 'b' };

describe('edgeEmphasis', () => {
  it('returns neutral when selection is empty', () => {
    expect(edgeEmphasis(edge, [])).toBe('neutral');
  });

  it('returns incident when sourceId is selected', () => {
    expect(edgeEmphasis(edge, ['a'])).toBe('incident');
  });

  it('returns incident when targetId is selected', () => {
    expect(edgeEmphasis(edge, ['b'])).toBe('incident');
  });

  it('returns dimmed when neither endpoint is selected', () => {
    expect(edgeEmphasis(edge, ['c'])).toBe('dimmed');
  });

  it('returns incident when edge is incident to any selected node in multi-select', () => {
    expect(edgeEmphasis(edge, ['c', 'a'])).toBe('incident');
  });

  it('returns dimmed when no selected node matches either endpoint in multi-select', () => {
    expect(edgeEmphasis(edge, ['c', 'd'])).toBe('dimmed');
  });
});
