import { describe, it, expect } from 'vitest';
import { interpolate, evalCondition } from '../../src/render/interpolate.ts';

describe('interpolate', () => {
  it('replaces a simple path', () => {
    expect(interpolate('{content.name}', { name: 'Alice' })).toBe('Alice');
  });

  it('replaces a dotted path', () => {
    expect(interpolate('{content.meta.version}', { meta: { version: '1.2.3' } })).toBe('1.2.3');
  });

  it('returns empty string for missing path', () => {
    expect(interpolate('{content.missing}', {})).toBe('');
  });

  it('replaces multiple occurrences', () => {
    const result = interpolate('{content.a} and {content.b}', { a: 'foo', b: 'bar' });
    expect(result).toBe('foo and bar');
  });

  it('coerces non-string values to string', () => {
    expect(interpolate('{content.count}', { count: 42 })).toBe('42');
  });

  it('join filter joins an array with the separator', () => {
    expect(interpolate("{content.tags | join:', '}", { tags: ['a', 'b', 'c'] })).toBe('a, b, c');
  });

  it('join filter on non-array falls back to string coercion', () => {
    expect(interpolate("{content.x | join:', '}", { x: 'hello' })).toBe('hello');
  });

  it('leaves unrelated text intact', () => {
    expect(interpolate('Hello, {content.name}!', { name: 'World' })).toBe('Hello, World!');
  });
});

describe('evalCondition', () => {
  it('truthy path resolves true for truthy value', () => {
    expect(evalCondition('content.name', { name: 'Alice' })).toBe(true);
  });

  it('truthy path resolves false for falsy value', () => {
    expect(evalCondition('content.name', { name: '' })).toBe(false);
    expect(evalCondition('content.missing', {})).toBe(false);
  });

  it('negation is true for missing/falsy', () => {
    expect(evalCondition('!content.missing', {})).toBe(true);
    expect(evalCondition('!content.name', { name: 'Alice' })).toBe(false);
  });

  it('strict equality with literal', () => {
    expect(evalCondition("content.status === 'active'", { status: 'active' })).toBe(true);
    expect(evalCondition("content.status === 'active'", { status: 'idle' })).toBe(false);
  });

  it('length > N is true when array is longer', () => {
    expect(evalCondition('content.items.length > 0', { items: ['a'] })).toBe(true);
    expect(evalCondition('content.items.length > 0', { items: [] })).toBe(false);
  });

  it('length > N works on strings', () => {
    expect(evalCondition('content.label.length > 2', { label: 'abc' })).toBe(true);
    expect(evalCondition('content.label.length > 5', { label: 'abc' })).toBe(false);
  });

  it('unrecognized expression returns false', () => {
    expect(evalCondition('totally-invalid', {})).toBe(false);
  });
});
