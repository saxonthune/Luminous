import { describe, it, expect } from 'vitest';
import { chordHeld, chordKeys, describeChord } from '../inputBindings.ts';

describe('inputBindings', () => {
  it('chordHeld reads Ctrl, Meta, or the pre-resolved flag', () => {
    expect(chordHeld('edge.connectToNewNode', { ctrlKey: true, metaKey: false })).toBe(true);
    expect(chordHeld('edge.connectToNewNode', { ctrlKey: false, metaKey: true })).toBe(true);
    expect(chordHeld('edge.connectToNewNode', { ctrlKey: false, metaKey: false })).toBe(false);
    // cactus gesture payloads carry only the resolved ctrlKey flag.
    expect(chordHeld('edge.connectToNewNode', { ctrlKey: true })).toBe(true);
  });

  it('chordKeys names the keydown/keyup keys that toggle the chord', () => {
    expect(chordKeys('container.keepMembership')).toEqual(['Control', 'Meta']);
  });

  it('describeChord names the chord for user-facing text', () => {
    // jsdom is not a Mac platform, so the primary modifier reads as ctrl.
    expect(describeChord('edge.connectToNewNode')).toBe('ctrl');
  });
});
