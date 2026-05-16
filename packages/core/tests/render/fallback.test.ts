import { describe, it, expect } from 'vitest';
import { generateFallbackRender } from '../../src/render/fallback.ts';
import type { NodeKind } from '../../src/types.ts';

function makeKind(label: string, id = 'test.kind'): NodeKind {
  return {
    id,
    label,
    propsSchema: { parse: (x) => x, safeParse: (x) => ({ success: true, data: x }) },
    idDerivation: (x) => String(x),
  };
}

describe('generateFallbackRender', () => {
  it('never throws for undefined kind and empty content', () => {
    expect(() => generateFallbackRender(undefined, {})).not.toThrow();
  });

  it('produces a card > vstack > text(heading) structure', () => {
    const result = generateFallbackRender(undefined, {});
    expect(result.type).toBe('card');
    const vstack = (result.children as unknown[])[0] as Record<string, unknown>;
    expect(vstack['type']).toBe('vstack');
    const heading = (vstack['children'] as unknown[])[0] as Record<string, unknown>;
    expect(heading['type']).toBe('text');
    expect(heading['style']).toBe('heading');
  });

  it('uses the first string field as heading', () => {
    const result = generateFallbackRender(undefined, { name: 'MyNode', count: 3 });
    const vstack = (result.children as unknown[])[0] as Record<string, unknown>;
    const heading = (vstack['children'] as unknown[])[0] as Record<string, unknown>;
    expect(heading['value']).toBe('MyNode');
  });

  it('falls back to kind label when content has no string fields', () => {
    const kind = makeKind('State');
    const result = generateFallbackRender(kind, { count: 5 });
    const vstack = (result.children as unknown[])[0] as Record<string, unknown>;
    const heading = (vstack['children'] as unknown[])[0] as Record<string, unknown>;
    expect(heading['value']).toBe('State');
  });

  it('falls back to "Unknown" when kind is undefined and no string fields', () => {
    const result = generateFallbackRender(undefined, { count: 5 });
    const vstack = (result.children as unknown[])[0] as Record<string, unknown>;
    const heading = (vstack['children'] as unknown[])[0] as Record<string, unknown>;
    expect(heading['value']).toBe('Unknown');
  });

  it('emits one text line per remaining field', () => {
    const result = generateFallbackRender(undefined, { name: 'Node', count: 3, active: true });
    const vstack = (result.children as unknown[])[0] as Record<string, unknown>;
    const children = vstack['children'] as unknown[];
    // heading + 2 remaining fields
    expect(children.length).toBe(3);
    const countLine = children[1] as Record<string, unknown>;
    expect(countLine['type']).toBe('text');
    expect(countLine['value']).toContain('count');
  });

  it('formats array values with join in field lines', () => {
    const result = generateFallbackRender(undefined, { name: 'N', tags: ['a', 'b'] });
    const vstack = (result.children as unknown[])[0] as Record<string, unknown>;
    const children = vstack['children'] as unknown[];
    const tagsLine = children[1] as Record<string, unknown>;
    expect(String(tagsLine['value'])).toContain('a, b');
  });
});
