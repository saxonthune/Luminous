import { describe, expect, it } from 'vitest';
import type { NylonDocument } from '@luminous/core/nylon';
import { arrangeNylonContainer, type NylonDagDirection } from '@luminous/core/nylon/dagArrange';
import { COMPACT_PAIR_WIDTH, TRANSFORMATION_SIZE, projectNylon } from '@luminous/core/nylon/projection';

function chainDocument(): NylonDocument {
  return {
    v: 1,
    transformations: [
      { id: 'parent', name: 'Parent', x: 0, y: 0 },
      { id: 'first', name: 'First', parent: 'parent', x: 200, y: 200 },
      { id: 'last', name: 'Last', parent: 'parent', x: 20, y: 20 },
    ],
    contracts: [{ id: 'middle', name: 'Middle', parent: 'parent', x: 100, y: 100 }],
    arcs: [
      { from: 'first', to: 'middle' },
      { from: 'middle', to: 'last' },
    ],
  };
}

describe('arrangeNylonContainer', () => {
  it.each([
    ['TD', 'y', 1],
    ['DT', 'y', -1],
    ['LR', 'x', 1],
    ['RL', 'x', -1],
  ] as const)('orders a chain in the %s direction', (direction, axis, sign) => {
    const doc = chainDocument();
    const result = arrangeNylonContainer(doc, projectNylon(doc), 'parent', direction as NylonDagDirection);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = new Map([
      ...result.doc.transformations.map((item) => [item.id, item] as const),
      ...result.doc.contracts.map((item) => [item.id, item] as const),
    ]);
    const first = items.get('first')!;
    const middle = items.get('middle')!;
    const last = items.get('last')!;
    expect(Math.sign(middle[axis]! - first[axis]!)).toBe(sign);
    expect(Math.sign(last[axis]! - middle[axis]!)).toBe(sign);
  });

  it('lifts descendant arcs while preserving deeper stored positions', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent' },
        { id: 'nested', name: 'Nested', parent: 'parent', x: 400, y: 20 },
        { id: 'inside', name: 'Inside', parent: 'nested', x: 73, y: 91 },
        { id: 'last', name: 'Last', parent: 'parent', x: 20, y: 20 },
      ],
      contracts: [{ id: 'middle', name: 'Middle', parent: 'parent' }],
      arcs: [{ from: 'inside', to: 'middle' }, { from: 'middle', to: 'last' }],
    };
    const result = arrangeNylonContainer(doc, projectNylon(doc), 'parent', 'LR');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nested = result.doc.transformations.find((item) => item.id === 'nested')!;
    const middle = result.doc.contracts.find((item) => item.id === 'middle')!;
    const inside = result.doc.transformations.find((item) => item.id === 'inside')!;
    expect(nested.x).toBeLessThan(middle.x!);
    expect(inside).toMatchObject({ x: 73, y: 91 });
  });

  it('moves a Contract Pair as one unit without changing its inner geometry', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent', contractPair: { input: 'request', output: 'response' } },
        { id: 'step', name: 'Step', parent: 'parent' },
      ],
      contracts: [
        { id: 'request', name: 'Request', parent: 'parent', x: 300, y: 140 },
        { id: 'response', name: 'Response', parent: 'parent', x: 320, y: 310 },
      ],
      arcs: [{ from: 'step', to: 'request' }],
    };
    const beforeDx = doc.contracts[1].x! - doc.contracts[0].x!;
    const beforeDy = doc.contracts[1].y! - doc.contracts[0].y!;
    const result = arrangeNylonContainer(doc, projectNylon(doc), 'parent', 'TD');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const request = result.doc.contracts.find((item) => item.id === 'request')!;
    const response = result.doc.contracts.find((item) => item.id === 'response')!;
    expect(response.x! - request.x!).toBe(beforeDx);
    expect(response.y! - request.y!).toBe(beforeDy);
  });

  it('orders local Children through a path that leaves and returns through an external Contract Pair', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'repository', name: 'Repository' },
        { id: 'prepare', name: 'Prepare SQL query', parent: 'repository', x: 500, y: 100 },
        { id: 'materialize', name: 'Materialize CustomerRow', parent: 'repository', x: 20, y: 100 },
        { id: 'database', name: 'Database', contractPair: { input: 'sql-query', output: 'sql-result' } },
        { id: 'execute', name: 'Execute query', parent: 'database' },
        { id: 'return', name: 'Return result', parent: 'database' },
      ],
      contracts: [
        { id: 'sql-query', name: 'SQL query' },
        { id: 'rows', name: 'Rows', parent: 'database' },
        { id: 'sql-result', name: 'SQL result' },
      ],
      arcs: [
        { from: 'prepare', to: 'sql-query' },
        { from: 'sql-query', to: 'execute' },
        { from: 'execute', to: 'rows' },
        { from: 'rows', to: 'return' },
        { from: 'return', to: 'sql-result' },
        { from: 'sql-result', to: 'materialize' },
      ],
    };

    const result = arrangeNylonContainer(doc, projectNylon(doc), 'repository', 'LR');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const prepare = result.doc.transformations.find((item) => item.id === 'prepare')!;
    const materialize = result.doc.transformations.find((item) => item.id === 'materialize')!;
    expect(prepare.x).toBeLessThan(materialize.x!);
    expect(materialize.x! - prepare.x! - TRANSFORMATION_SIZE).toBeGreaterThan(COMPACT_PAIR_WIDTH);
  });
});
