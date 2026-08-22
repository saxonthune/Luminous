import { describe, it, expect } from 'vitest';
import type { DataflowDocument } from '@luminous/core/dataflow';
import {
  BOX_WIDTH,
  estimateBoxHeight,
  toTidyNodes,
  toLayoutEdges,
  toEdgeDeclarations,
  toClusterDeclarations,
} from '../projection';

const doc: DataflowDocument = {
  v: 1,
  boxes: [
    { id: 'a', name: 'Json w/ standings' },
    {
      id: 'b',
      name: 'Bracket w/ teams',
      description: 'A description long enough to wrap across more than one line of text.',
      contract: { format: 'json-schema', text: '{"type":"object"}' },
    },
  ],
  flows: [{ from: 'a', to: 'b' }],
};

describe('toTidyNodes', () => {
  it('maps every box to a flat TidyNode with no parent', () => {
    const nodes = toTidyNodes(doc);
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.parentId === null)).toBe(true);
    expect(nodes.every((n) => n.w === BOX_WIDTH)).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('gives a taller box more height when it has a description and a contract', () => {
    const nodes = toTidyNodes(doc);
    const [a, b] = nodes;
    expect(b.h).toBeGreaterThan(a.h);
  });
});

describe('estimateBoxHeight', () => {
  it('grows with description length', () => {
    const short = estimateBoxHeight({ id: 'x', name: 'x', description: 'short' });
    const long = estimateBoxHeight({ id: 'x', name: 'x', description: 'x'.repeat(200) });
    expect(long).toBeGreaterThan(short);
  });

  it('adds height for a contract block', () => {
    const withoutContract = estimateBoxHeight({ id: 'x', name: 'x' });
    const withContract = estimateBoxHeight({
      id: 'x',
      name: 'x',
      contract: { format: 'text', text: 'hello' },
    });
    expect(withContract).toBeGreaterThan(withoutContract);
  });
});

describe('toLayoutEdges', () => {
  it('maps each flow to a source/target pair', () => {
    expect(toLayoutEdges(doc)).toEqual([{ source: 'a', target: 'b' }]);
  });
});

describe('toEdgeDeclarations', () => {
  it('maps each flow to an EdgeDeclaration with a unique id', () => {
    const decls = toEdgeDeclarations(doc);
    expect(decls).toHaveLength(1);
    expect(decls[0]).toMatchObject({ sourceId: 'a', targetId: 'b' });
    expect(decls[0].id).toBeTruthy();
  });
});

const groupedDoc: DataflowDocument = {
  v: 1,
  boxes: [
    { id: 'a', name: 'a', group: 'Static Files' },
    { id: 'b', name: 'b', group: 'Views' },
    { id: 'c', name: 'c', group: 'Static Files' },
    { id: 'd', name: 'd' },
  ],
  flows: [],
};

describe('toClusterDeclarations', () => {
  it('derives one cluster per distinct group name with its members', () => {
    const clusters = toClusterDeclarations(groupedDoc);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ id: 'Static Files', label: 'Static Files', memberIds: ['a', 'c'] });
    expect(clusters[1]).toMatchObject({ id: 'Views', label: 'Views', memberIds: ['b'] });
  });

  it('excludes ungrouped boxes from every cluster', () => {
    const clusters = toClusterDeclarations(groupedDoc);
    expect(clusters.some((c) => c.memberIds.includes('d'))).toBe(false);
  });
});

describe('toTidyNodes clusterId', () => {
  it('carries clusterId from the box group', () => {
    const nodes = toTidyNodes(groupedDoc);
    expect(nodes.find((n) => n.id === 'a')?.clusterId).toBe('Static Files');
    expect(nodes.find((n) => n.id === 'd')?.clusterId).toBeUndefined();
  });
});
