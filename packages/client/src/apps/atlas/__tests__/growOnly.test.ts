import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { buildGrowOnlyActions, sizeTouchedIds } from '../growOnly.ts';
import { projectAtlasNodes } from '../projection.ts';

function doc(nodes: AtlasDocument['nodes']): AtlasDocument {
  return { v: 1, nodes, edges: [] };
}

function sizeOf(d: AtlasDocument, id: string): { w: number; h: number } {
  const rn = projectAtlasNodes(d).find((n) => n.node.id === id)!;
  return { w: rn.w, h: rn.h };
}

describe('buildGrowOnlyActions', () => {
  const before = doc([
    { id: 'p', name: 'P' },
    { id: 'a', name: 'A', parent: 'p', x: 200, y: 200 },
  ]);

  it('floors a Container whose box shrank, at its before-size', () => {
    const after = doc([
      { id: 'p', name: 'P' },
      { id: 'a', name: 'A', parent: 'p', x: 0, y: 0 },
    ]);
    const prev = sizeOf(before, 'p');
    const actions = buildGrowOnlyActions(before, after, new Set());
    expect(actions).toEqual([
      { type: 'setNode', id: 'p', contentWidth: prev.w, contentHeight: prev.h },
    ]);
  });

  it('emits nothing when a Container grew or stayed', () => {
    const after = doc([
      { id: 'p', name: 'P' },
      { id: 'a', name: 'A', parent: 'p', x: 400, y: 400 },
    ]);
    expect(buildGrowOnlyActions(before, after, new Set())).toEqual([]);
  });

  it('skips a Container whose size the batch touched on purpose', () => {
    const after = doc([
      { id: 'p', name: 'P' },
      { id: 'a', name: 'A', parent: 'p', x: 0, y: 0 },
    ]);
    expect(buildGrowOnlyActions(before, after, new Set(['p']))).toEqual([]);
  });

  it('skips a Node that stopped being a Container — it collapses to leaf size', () => {
    const after = doc([{ id: 'p', name: 'P' }]);
    expect(buildGrowOnlyActions(before, after, new Set())).toEqual([]);
  });
});

describe('sizeTouchedIds', () => {
  it('collects setNode ids that carry a size key, including a clearing undefined', () => {
    expect(
      sizeTouchedIds([
        { type: 'setNode', id: 'a', contentWidth: undefined },
        { type: 'setNode', id: 'b', contentHeight: 100 },
        { type: 'setNode', id: 'c', x: 1, y: 2 },
      ]),
    ).toEqual(new Set(['a', 'b']));
  });
});
