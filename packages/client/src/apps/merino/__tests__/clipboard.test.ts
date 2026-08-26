import { describe, expect, it } from 'vitest';
import type { MerinoDocument } from '@luminous/core/merino';
import { copyMerinoSelection, pasteMerinoSelection } from '../clipboard.ts';

const doc: MerinoDocument = {
  v: 1,
  nodeTypes: [{ id: 'requirement', name: 'Requirement', color: 'accent-1' }],
  edgeTypes: [{ id: 'needs', name: 'Needs', color: 'accent-2', dash: 'solid', arrowHead: true, directed: true }],
  nodes: [
    { id: 'a', tab: 'requirements', type: 'requirement', name: 'A', x: 10, y: 20 },
    { id: 'b', tab: 'requirements', type: 'requirement', name: 'B', parent: 'a', x: 30, y: 40, expanded: true },
    { id: 'c', tab: 'requirements', type: 'requirement', name: 'C', x: 50, y: 60 },
  ],
  edges: [
    { id: 'a-b', tab: 'requirements', type: 'needs', from: 'a', to: 'b' },
    { id: 'b-c', tab: 'requirements', type: 'needs', from: 'b', to: 'c' },
  ],
};

const renderNodes = doc.nodes.map((node) => ({
  node, x: node.x!, y: node.y!, w: 100, h: 50,
  isContainer: false, isList: false, contained: false, hasChildren: false, depth: 0,
}));

describe('Merino clipboard', () => {
  it('copies selected nodes, their internal edges, and their rendered positions', () => {
    const copied = copyMerinoSelection(doc, ['a', 'b'], renderNodes)!;
    expect(copied.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(copied.edges.map((edge) => edge.id)).toEqual(['a-b']);

    const pasted = pasteMerinoSelection(doc, copied, 'deployments', { x: 100, y: 200 });
    expect(pasted.nodeIds).toEqual(['n-1', 'n-2']);
    expect(pasted.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'addNode', id: 'n-1', tab: 'deployments', x: 110, y: 220 }),
      expect.objectContaining({ type: 'addNode', id: 'n-2', tab: 'deployments', parent: 'n-1', x: 130, y: 240 }),
      expect.objectContaining({ type: 'connect', from: 'n-1', to: 'n-2' }),
    ]));
  });

  it('drops parent and edges outside a partial selection', () => {
    const copied = copyMerinoSelection(doc, ['b'], renderNodes)!;
    const pasted = pasteMerinoSelection(doc, copied, 'requirements', { x: 0, y: 0 });
    expect(pasted.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'addNode', parent: undefined }),
    ]));
    expect(pasted.actions.some((action) => action.type === 'connect')).toBe(false);
  });
});
