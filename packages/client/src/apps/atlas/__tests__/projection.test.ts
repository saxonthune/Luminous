import { describe, it, expect } from 'vitest';
import type { AtlasDocument } from '@luminous/core/atlas';
import { layoutAtlas } from '../layout.ts';
import { toEdgeDeclarations, projectAtlasNodes } from '../projection.ts';

const doc: AtlasDocument = {
  v: 1,
  nodes: [
    { id: 'root', name: 'Root' },
    { id: 'child-a', name: 'Child A', parent: 'root' },
    { id: 'child-b', name: 'Child B', parent: 'root' },
    { id: 'grandchild', name: 'Grandchild', parent: 'child-a' },
    { id: 'sibling', name: 'Sibling' },
  ],
  edges: [{ from: 'root', to: 'sibling', label: 'connects to' }],
};

describe('layoutAtlas', () => {
  it('assigns a position to every node', () => {
    const positions = layoutAtlas(doc);
    for (const node of doc.nodes) {
      expect(positions.has(node.id)).toBe(true);
    }
  });
});

describe('projectAtlasNodes', () => {
  it('assigns a position to every node', () => {
    const rendered = projectAtlasNodes(doc);
    expect(rendered).toHaveLength(doc.nodes.length);
    for (const rn of rendered) {
      expect(typeof rn.x).toBe('number');
      expect(typeof rn.y).toBe('number');
    }
  });

  it('marks nodes with children as containers', () => {
    const rendered = projectAtlasNodes(doc);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    expect(byId.get('root')?.hasChildren).toBe(true);
    expect(byId.get('child-a')?.hasChildren).toBe(true);
    expect(byId.get('child-b')?.hasChildren).toBe(false);
    expect(byId.get('grandchild')?.hasChildren).toBe(false);
    expect(byId.get('sibling')?.hasChildren).toBe(false);
  });

  it('nests a grandchild inside its parent and grandparent bounds', () => {
    const rendered = projectAtlasNodes(doc);
    const byId = new Map(rendered.map((rn) => [rn.node.id, rn]));
    const root = byId.get('root')!;
    const childA = byId.get('child-a')!;
    const grandchild = byId.get('grandchild')!;

    // Absolute positions: a grandchild's box lies within its parent's box,
    // which lies within the root's box.
    expect(childA.x).toBeGreaterThanOrEqual(root.x);
    expect(childA.y).toBeGreaterThanOrEqual(root.y);
    expect(childA.x + childA.w).toBeLessThanOrEqual(root.x + root.w);
    expect(childA.y + childA.h).toBeLessThanOrEqual(root.y + root.h);

    expect(grandchild.x).toBeGreaterThanOrEqual(childA.x);
    expect(grandchild.y).toBeGreaterThanOrEqual(childA.y);
    expect(grandchild.x + grandchild.w).toBeLessThanOrEqual(childA.x + childA.w);
    expect(grandchild.y + grandchild.h).toBeLessThanOrEqual(childA.y + childA.h);
  });

  it('orders parents before their children', () => {
    const rendered = projectAtlasNodes(doc);
    const indexOf = new Map(rendered.map((rn, i) => [rn.node.id, i]));
    expect(indexOf.get('root')!).toBeLessThan(indexOf.get('child-a')!);
    expect(indexOf.get('child-a')!).toBeLessThan(indexOf.get('grandchild')!);
  });
});

describe('toEdgeDeclarations', () => {
  it('projects one EdgeDeclaration per AtlasEdge', () => {
    const edges = toEdgeDeclarations(doc);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ sourceId: 'root', targetId: 'sibling', labelText: 'connects to' });
  });
});
