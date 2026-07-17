import { describe, it, expect } from 'vitest';
import { selfAndAncestors } from '../AtlasCanvas.tsx';

describe('selfAndAncestors', () => {
  it('returns just the id when it has no parent', () => {
    const parentOf = new Map<string, string>();
    expect(selfAndAncestors('root', parentOf)).toEqual(['root']);
  });

  it('walks up through every ancestor', () => {
    const parentOf = new Map([
      ['grandchild', 'child'],
      ['child', 'parent'],
    ]);
    expect(selfAndAncestors('grandchild', parentOf)).toEqual(['grandchild', 'child', 'parent']);
  });

  it('stops at a node whose parent is not in the map', () => {
    const parentOf = new Map([['child', 'parent']]);
    expect(selfAndAncestors('child', parentOf)).toEqual(['child', 'parent']);
  });
});
