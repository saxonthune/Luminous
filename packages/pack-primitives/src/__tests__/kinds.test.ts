import { describe, it, expect } from 'vitest';
import { boxKind, arrowKind, nodeKinds, edgeKinds } from '../schema/kinds.ts';

describe('boxKind props schema', () => {
  it('rejects missing label', () => {
    const result = boxKind.propsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts minimal { label }', () => {
    const result = boxKind.propsSchema.safeParse({ label: 'x' });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = boxKind.propsSchema.safeParse({
      label: 'Alpha',
      description: 'A box.',
      color: '#4a90e2',
      tag: 'module',
    });
    expect(result.success).toBe(true);
  });
});

describe('arrowKind props schema', () => {
  it('accepts empty {}', () => {
    const result = arrowKind.propsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts optional label and color', () => {
    const result = arrowKind.propsSchema.safeParse({ label: 'depends on', color: '#999' });
    expect(result.success).toBe(true);
  });
});

describe('pack kind ids', () => {
  it('nodeKinds contains prim.box', () => {
    expect(nodeKinds.map(k => k.id)).toContain('prim.box');
  });

  it('edgeKinds contains prim.arrow', () => {
    expect(edgeKinds.map(k => k.id)).toContain('prim.arrow');
  });

  it('arrowKind is directed', () => {
    expect(arrowKind.directed).toBe(true);
  });
});
