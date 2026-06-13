import { describe, it, expect } from 'vitest';
import { parseHotkey, matchesHotkey } from '../src/chrome/parseHotkey';

describe('parseHotkey', () => {
  it('parses a plain key', () => {
    expect(parseHotkey('A')).toEqual({ key: 'A', mod: false, shift: false, alt: false });
  });

  it('parses Mod+K', () => {
    const result = parseHotkey('Mod+K');
    expect(result.key).toBe('K');
    expect(result.mod).toBe(true);
    expect(result.shift).toBe(false);
    expect(result.alt).toBe(false);
  });

  it('parses Mod+Shift+K', () => {
    const result = parseHotkey('Mod+Shift+K');
    expect(result.key).toBe('K');
    expect(result.mod).toBe(true);
    expect(result.shift).toBe(true);
    expect(result.alt).toBe(false);
  });

  it('parses Mod+Alt+F', () => {
    const result = parseHotkey('Mod+Alt+F');
    expect(result.key).toBe('F');
    expect(result.mod).toBe(true);
    expect(result.alt).toBe(true);
    expect(result.shift).toBe(false);
  });

  it('parses Shift+F2', () => {
    const result = parseHotkey('Shift+F2');
    expect(result.key).toBe('F2');
    expect(result.mod).toBe(false);
    expect(result.shift).toBe(true);
  });
});

describe('matchesHotkey', () => {
  function makeEvent(key: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
    return {
      key,
      ctrlKey: mods.ctrl ?? false,
      metaKey: mods.meta ?? false,
      shiftKey: mods.shift ?? false,
      altKey: mods.alt ?? false,
    } as KeyboardEvent;
  }

  it('matches Ctrl+K on non-Mac (ctrlKey)', () => {
    // On non-Mac, matchesHotkey uses ctrlKey for Mod
    const event = makeEvent('K', { ctrl: true });
    // Note: isMac is determined by navigator.platform at module load time.
    // In JSDOM, navigator.platform is not "Mac...", so Mod → ctrlKey.
    expect(matchesHotkey(event, 'Mod+K')).toBe(true);
  });

  it('does not match when mod is required but not pressed', () => {
    const event = makeEvent('K');
    expect(matchesHotkey(event, 'Mod+K')).toBe(false);
  });

  it('does not match a different key', () => {
    const event = makeEvent('J', { ctrl: true });
    expect(matchesHotkey(event, 'Mod+K')).toBe(false);
  });

  it('matches plain key without modifiers', () => {
    const event = makeEvent('F2');
    expect(matchesHotkey(event, 'F2')).toBe(true);
  });

  it('matches Ctrl+Shift+F', () => {
    const event = makeEvent('F', { ctrl: true, shift: true });
    expect(matchesHotkey(event, 'Mod+Shift+F')).toBe(true);
  });
});
