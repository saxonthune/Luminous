import { describe, expect, it } from 'vitest';
import type { NylonDocument } from '@luminous/core/nylon';
import { nylonSelectionRoots, translateNylonSelection } from '@luminous/core/nylon/dragSelection';

const doc: NylonDocument = {
  v: 1,
  transformations: [
    { id: 'parent', name: 'Parent', x: 10, y: 20 },
    { id: 'child', name: 'Child', parent: 'parent', x: 30, y: 40 },
    { id: 'sibling', name: 'Sibling', x: 100, y: 120 },
  ],
  contracts: [],
  arcs: [],
};

describe('Nylon selection drag', () => {
  it('reduces a nested selection to its roots', () => {
    expect(nylonSelectionRoots(doc, ['parent', 'child', 'sibling'])).toEqual(['parent', 'sibling']);
  });

  it('moves roots together and leaves a selected descendant parent-relative', () => {
    const roots = nylonSelectionRoots(doc, ['parent', 'child', 'sibling']);
    const result = translateNylonSelection(doc, roots, 7, 11);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.transformations.find((item) => item.id === 'parent')).toMatchObject({ x: 17, y: 31 });
    expect(result.doc.transformations.find((item) => item.id === 'sibling')).toMatchObject({ x: 107, y: 131 });
    expect(result.doc.transformations.find((item) => item.id === 'child')).toMatchObject({ x: 30, y: 40 });
  });
});
