import { describe, it, expect } from 'vitest';
import { emptyAtlasData, parseAtlasData, resolveContent } from '../../src/atlas/data.ts';
import type { AtlasData } from '../../src/atlas/data.ts';
import type { AtlasContent } from '../../src/atlas/types.ts';

describe('emptyAtlasData', () => {
  it('returns v1 with no entries', () => {
    expect(emptyAtlasData()).toEqual({ v: 1, entries: {} });
  });
});

describe('parseAtlasData', () => {
  it('accepts a valid sidecar', () => {
    const data: AtlasData = {
      v: 1,
      of: 'my.atlas.json',
      generatedAt: '2026-01-01T00:00:00Z',
      entries: {
        'route.list': { text: 'GET /a\nGET /b', source: { path: 'src/routes.ts', lines: [10, 20], rev: 'abc123' } },
        'other.key': { text: 'plain text' },
      },
    };
    const result = parseAtlasData(JSON.stringify(data));
    expect(result).toEqual({ ok: true, data });
  });

  it('rejects an unknown top-level field', () => {
    const result = parseAtlasData(JSON.stringify({ v: 1, entries: {}, extra: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain(': unknown field "extra"');
  });

  it('rejects a non-string text', () => {
    const result = parseAtlasData(JSON.stringify({ v: 1, entries: { k: { text: 5 } } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('entries.k.text: must be a string');
  });

  it('rejects a non-object entry', () => {
    const result = parseAtlasData(JSON.stringify({ v: 1, entries: { k: 'not an object' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContain('entries.k: entry must be an object');
  });
});

describe('resolveContent', () => {
  const data: AtlasData = {
    v: 1,
    entries: {
      present: { text: 'generated text', source: { path: 'src/a.ts' } },
    },
  };

  it('returns undefined when there is no content', () => {
    expect(resolveContent(undefined, data)).toBeUndefined();
  });

  it('returns the authored text with filled false when there is no "from"', () => {
    const content: AtlasContent = { text: 'authored', mode: 'markdown' };
    expect(resolveContent(content, data)).toEqual({
      text: 'authored',
      mode: 'markdown',
      filled: false,
      missingKey: false,
    });
  });

  it('returns the entry text with filled true when the key is present', () => {
    const content: AtlasContent = { text: 'authored', mode: 'code', from: 'present' };
    expect(resolveContent(content, data)).toEqual({
      text: 'generated text',
      mode: 'code',
      filled: true,
      missingKey: false,
      key: 'present',
      source: { path: 'src/a.ts' },
    });
  });

  it('returns the authored text with missingKey true when the key is absent', () => {
    const content: AtlasContent = { text: 'authored', mode: 'markdown', from: 'missing' };
    expect(resolveContent(content, data)).toEqual({
      text: 'authored',
      mode: 'markdown',
      filled: false,
      missingKey: true,
      key: 'missing',
    });
  });

  it('takes mode from the authored content, never from the entry', () => {
    const content: AtlasContent = { text: 'authored', mode: 'code', from: 'present' };
    const resolved = resolveContent(content, data);
    expect(resolved?.mode).toBe('code');
  });
});
