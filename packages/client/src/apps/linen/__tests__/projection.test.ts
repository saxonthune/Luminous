import { describe, it, expect } from 'vitest';
import type { LinenDocument } from '@luminous/core/linen';
import { serializeLinenDocument } from '@luminous/core/linen';
import { projectLinen, renderNodeId } from '../projection.ts';

function fixture(): LinenDocument {
  return {
    v: 1,
    modules: [
      { id: 'worker', name: 'Worker' },
      { id: 'kv', name: 'KV' },
    ],
    contracts: [{ id: 'snapshot', name: 'RenderSnapshot' }],
    nodes: [
      { id: 'start', kind: 'entry', module: 'worker' },
      { id: 'branch', kind: 'switch', module: 'worker' },
      { id: 'shape', kind: 'transformation', module: 'worker' },
      { id: 'store', kind: 'pass', module: 'worker', to: 'kv' },
    ],
    edges: [
      { from: 'start', to: 'branch' },
      { from: 'branch', to: 'shape' },
      { from: 'branch', to: 'store' },
      { from: 'kv', to: 'snapshot' },
    ],
  };
}

describe('projectLinen', () => {
  it('lays Trace Nodes out in derived Trace order, top to bottom', () => {
    const { nodes } = projectLinen(fixture());
    const ys = new Map(
      nodes.filter((n) => n.kind === 'trace-node').map((n) => [renderNodeId(n), n.y]),
    );
    expect(ys.get('start')!).toBeLessThan(ys.get('branch')!);
    expect(ys.get('branch')!).toBeLessThan(ys.get('shape')!);
    expect(ys.get('shape')!).toBeLessThan(ys.get('store')!);
  });

  it('offsets a later Switch branch one column right', () => {
    const { nodes } = projectLinen(fixture());
    const xs = new Map(
      nodes.filter((n) => n.kind === 'trace-node').map((n) => [renderNodeId(n), n.x]),
    );
    expect(xs.get('store')!).toBeGreaterThan(xs.get('shape')!);
  });

  it('a stored x/y overrides the derived slot', () => {
    const doc = fixture();
    doc.nodes[2] = { ...doc.nodes[2], x: 500, y: 700 };
    const { nodes } = projectLinen(doc);
    const moduleRn = nodes.find((n) => n.kind === 'module' && n.module.id === 'worker');
    const shape = nodes.find((n) => n.kind === 'trace-node' && renderNodeId(n) === 'shape');
    expect(shape !== undefined && moduleRn !== undefined).toBe(true);
    if (shape === undefined || moduleRn === undefined) return;
    expect(shape.x).toBeGreaterThan(moduleRn.x + 400);
  });

  it('adds a derived resume marker for a Pass with a Contract connected', () => {
    const { nodes } = projectLinen(fixture());
    const marker = nodes.find((n) => n.kind === 'resume');
    expect(marker).toMatchObject({ passId: 'store', contractName: 'RenderSnapshot' });
  });

  it('omits the resume marker when no Contract is connected', () => {
    const doc = fixture();
    doc.edges = doc.edges.filter((e) => e.from !== 'kv');
    const { nodes } = projectLinen(doc);
    expect(nodes.some((n) => n.kind === 'resume')).toBe(false);
  });

  it('the resume marker never reaches serialization', () => {
    const text = serializeLinenDocument(fixture());
    expect(text).not.toContain('resume');
  });

  it('styles control Edges solid and Edges to Contracts dashed', () => {
    const { edges } = projectLinen(fixture());
    const control = edges.find((e) => e.sourceId === 'start');
    const toContract = edges.find((e) => e.targetId === 'snapshot');
    expect(control?.styling?.dash).toBe('solid');
    expect(control?.styling?.arrowHead).toBe(true);
    expect(toContract?.styling?.dash).toBe('dashed');
  });

  it('renders Modules and Contracts as their own render nodes', () => {
    const { nodes } = projectLinen(fixture());
    const kinds = nodes.map((n) => n.kind);
    expect(kinds.filter((k) => k === 'module')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'contract')).toHaveLength(1);
  });
});
