import { describe, it, expect } from 'vitest';
import { PRIMITIVE_DESCRIPTORS } from '../src/render/primitive-descriptors.ts';
import { BUILTIN_PRIMITIVE_NAMES } from '../src/render/primitive-names.ts';

describe('PRIMITIVE_DESCRIPTORS', () => {
  const names = PRIMITIVE_DESCRIPTORS.map(d => d.name);
  const builtinSet = new Set<string>(BUILTIN_PRIMITIVE_NAMES);
  const descriptorSet = new Set(names);

  it('covers exactly the set of BUILTIN_PRIMITIVE_NAMES — no missing, no extra', () => {
    const missing = [...builtinSet].filter(n => !descriptorSet.has(n));
    const extra = [...descriptorSet].filter(n => !builtinSet.has(n));
    expect(missing, `missing descriptors for: ${missing.join(', ')}`).toHaveLength(0);
    expect(extra, `unexpected descriptors (not in BUILTIN_PRIMITIVE_NAMES): ${extra.join(', ')}`).toHaveLength(0);
  });

  it('has no duplicate names', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const n of names) {
      if (seen.has(n)) dupes.push(n);
      seen.add(n);
    }
    expect(dupes, `duplicate descriptor names: ${dupes.join(', ')}`).toHaveLength(0);
  });

  it('every descriptor has a non-empty description', () => {
    const missing = PRIMITIVE_DESCRIPTORS.filter(d => !d.description.trim());
    expect(missing.map(d => d.name)).toHaveLength(0);
  });

  it('every descriptor has a non-empty example', () => {
    const missing = PRIMITIVE_DESCRIPTORS.filter(d => !d.example.trim());
    expect(missing.map(d => d.name)).toHaveLength(0);
  });
});
