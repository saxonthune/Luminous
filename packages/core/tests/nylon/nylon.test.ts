import { describe, expect, it } from 'vitest';
import {
  applyNylonBatch,
  addNylonArc,
  addNylonContract,
  addNylonTransformation,
  checkNylonDocument,
  differentiateTransformation,
  doctorNylonDocument,
  insertNylonArc,
  parseNylonDocument,
  reparentNylonNode,
  serializeNylonDocument,
  translateNylonContractPair,
  translateNylonItem,
  type NylonDocument,
} from '../../src/nylon/index.ts';

function simple(): NylonDocument {
  return {
    v: 1,
    transformations: [{ id: 'api', name: 'API', prose: 'Handles the request.', needs: ['HTTP request'], x: 220, y: 40 }],
    contracts: [
      { id: 'request', name: 'Request', kind: 'environment-settings', text: '{}', x: 0, y: 70 },
      { id: 'response', name: 'Response', text: '{}', x: 500, y: 70 },
    ],
    arcs: [
      { from: 'request', to: 'api' },
      { from: 'api', to: 'response' },
    ],
  };
}

describe('Nylon documents', () => {
  it('round-trips the document', () => {
    const doc = simple();
    expect(parseNylonDocument(serializeNylonDocument(doc))).toEqual({ ok: true, doc });
  });

  it('rejects same-kind Arc ends', () => {
    const doc = simple();
    doc.arcs = [{ from: 'request', to: 'response' }];
    expect(checkNylonDocument(doc).map((issue) => issue.message)).toContain(
      'Arc "request" -> "response" breaks Contract–Transformation alternation',
    );
  });

  it('checks Contract Pair references', () => {
    const doc = simple();
    doc.transformations[0].contractPair = { input: 'request', output: 'missing' };
    expect(checkNylonDocument(doc).map((issue) => issue.message)).toContain(
      'Transformation "api" has unknown Output Contract "missing"',
    );
  });

  it('differentiates P–T–P into P–Tₐ₁–Pₐ–Tₐ₂–P', () => {
    const doc = simple();
    doc.transformations[0].contractPair = { input: 'request', output: 'response' };
    const result = differentiateTransformation(doc, 'api', {
      firstName: 'Controller',
      contractName: 'Model',
      secondName: 'Service',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.arcs).toEqual([
      { from: 'request', to: 'api-a1' },
      { from: 'api-a1', to: 'api-a' },
      { from: 'api-a', to: 'api-a2' },
      { from: 'api-a2', to: 'response' },
    ]);
    expect(result.doc.transformations.filter((item) => item.parent === 'api')).toHaveLength(2);
    expect(result.doc.transformations.filter((item) => item.parent === 'api').every((item) => item.needs?.length === 0)).toBe(true);
    expect(result.doc.contracts.filter((item) => item.parent === 'api')).toHaveLength(1);
    expect(result.doc.transformations.find((item) => item.id === 'api')?.contractPair).toEqual({
      input: 'request',
      output: 'response',
    });
    expect(checkNylonDocument(result.doc)).toEqual([]);
  });

  it('refuses to differentiate a Parent Transformation again', () => {
    const once = differentiateTransformation(simple(), 'api');
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(differentiateTransformation(once.doc, 'api')).toEqual({
      ok: false,
      error: 'Transformation "api" is already differentiated',
    });
  });

  it('moves a Parent Transformation without rewriting descendant-local positions', () => {
    const differentiated = differentiateTransformation(simple(), 'api');
    expect(differentiated.ok).toBe(true);
    if (!differentiated.ok) return;

    const moved = translateNylonItem(differentiated.doc, 'api', 25, -10);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(moved.doc.transformations.find((item) => item.id === 'api')).toMatchObject({ x: 245, y: 30 });
    expect(moved.doc.transformations.find((item) => item.id === 'api-a1')).toMatchObject({ x: 42, y: 80 });
    expect(moved.doc.transformations.find((item) => item.id === 'api-a2')).toMatchObject({ x: 462, y: 80 });
    expect(moved.doc.contracts.find((item) => item.id === 'api-a')).toMatchObject({ x: 262, y: 115 });
    expect(moved.doc.contracts.find((item) => item.id === 'request')).toMatchObject({ x: 0, y: 70 });
  });

  it('moves both Contracts in a Contract Pair', () => {
    const doc = simple();
    doc.transformations[0].contractPair = { input: 'request', output: 'response' };

    const moved = translateNylonContractPair(doc, 'api', 15, -5);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(moved.doc.contracts.find((item) => item.id === 'request')).toMatchObject({ x: 15, y: 65 });
    expect(moved.doc.contracts.find((item) => item.id === 'response')).toMatchObject({ x: 515, y: 65 });
    expect(moved.doc.transformations.find((item) => item.id === 'api')).toMatchObject({ x: 220, y: 40 });
  });

  it('adds positioned Nodes and validates new Arcs', () => {
    const withTransformation = addNylonTransformation(simple(), {
      id: 'nested', name: 'Nested', parent: 'api', x: 300, y: 400,
    });
    expect(withTransformation.ok).toBe(true);
    if (!withTransformation.ok) return;
    const withContract = addNylonContract(withTransformation.doc, {
      id: 'middle', name: 'Middle', kind: 'options', parent: 'api', x: 500, y: 435,
    });
    expect(withContract.ok).toBe(true);
    if (!withContract.ok) return;
    expect(withContract.doc.contracts.find((item) => item.id === 'middle')?.kind).toBe('options');
    expect(addNylonArc(withContract.doc, 'nested', 'middle').ok).toBe(true);
    expect(addNylonArc(withContract.doc, 'nested', 'api')).toMatchObject({ ok: false });
  });

  it('inserts new Nodes at the deeper Arc endpoint parent and allows reparenting', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'api', name: 'API' },
        { id: 'service', name: 'Service', parent: 'api' },
        { id: 'guard', name: 'Guard', parent: 'service', x: 100, y: 100 },
      ],
      contracts: [{ id: 'query', name: 'Query', x: 700, y: 135 }],
      arcs: [{ from: 'guard', to: 'query' }],
    };
    const inserted = insertNylonArc(doc, 'guard', 'query', {
      transformation: { id: 'repository', name: 'Repository', x: 480, y: 100 },
      contract: { id: 'repository-query', name: 'Repository query', x: 300, y: 135 },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.doc.transformations.find((item) => item.id === 'repository')?.parent).toBe('service');
    expect(inserted.doc.contracts.find((item) => item.id === 'repository-query')?.parent).toBe('service');
    expect(inserted.doc.arcs).toEqual([
      { from: 'guard', to: 'repository-query' },
      { from: 'repository-query', to: 'repository' },
      { from: 'repository', to: 'query' },
    ]);

    const movedTransformation = reparentNylonNode(inserted.doc, 'repository', 'api');
    expect(movedTransformation.ok).toBe(true);
    if (!movedTransformation.ok) return;
    const movedContract = reparentNylonNode(movedTransformation.doc, 'repository-query', 'api');
    expect(movedContract.ok).toBe(true);
    if (!movedContract.ok) return;
    expect(movedContract.doc.transformations.find((item) => item.id === 'repository')?.parent).toBe('api');
    expect(movedContract.doc.contracts.find((item) => item.id === 'repository-query')?.parent).toBe('api');
  });

  it('preserves rendered position when reparenting parent-relative Nodes', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'api', name: 'API', x: 200, y: 100 },
        { id: 'service', name: 'Service', parent: 'api', x: 50, y: 80 },
        { id: 'repository', name: 'Repository', parent: 'service', x: 300, y: 40 },
      ],
      contracts: [],
      arcs: [],
    };

    const result = reparentNylonNode(doc, 'repository', 'api');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.transformations.find((item) => item.id === 'repository')).toMatchObject({
      parent: 'api', x: 350, y: 120,
    });
  });

  it('applies a batch atomically and validates only the final Document', () => {
    const interrupted = simple();
    interrupted.transformations[0].id = 'renamed-api';
    const result = applyNylonBatch(interrupted, [
      { op: 'arc.remove', from: 'request', to: 'api' },
      { op: 'arc.remove', from: 'api', to: 'response' },
      { op: 'arc.add', from: 'request', to: 'renamed-api' },
      { op: 'arc.add', from: 'renamed-api', to: 'response' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(checkNylonDocument(result.doc)).toEqual([]);
  });

  it('doctors every unambiguous issue across a Document in one transaction', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'outer', name: 'Outer', parent: 'inner', x: 100, y: 100, contractPair: { input: 'in', output: 'out' } },
        { id: 'inner', name: 'Inner', parent: 'outer', x: -20, y: -30 },
        { id: 'leaf', name: 'Leaf', parent: 'missing' },
      ],
      contracts: [
        { id: 'in', name: 'Input', x: 10, y: 20 },
        { id: 'out', name: 'Output', parent: 'inner', x: 30, y: 40 },
      ],
      arcs: [
        { from: 'in', to: 'leaf' },
        { from: 'in', to: 'leaf' },
        { from: 'missing', to: 'leaf' },
        { from: 'outer', to: 'in' },
      ],
    };

    const result = doctorNylonDocument(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(checkNylonDocument(result.doc)).toEqual([]);
    const repairedLeaf = result.doc.transformations.find((item) => item.id === 'leaf');
    expect(repairedLeaf).toMatchObject({ x: 0, y: 0 });
    expect(repairedLeaf?.parent).toBeUndefined();
    expect(result.doc.contracts.find((item) => item.id === 'out')?.parent).toBeUndefined();
    expect(result.doc.arcs).toEqual([{ from: 'in', to: 'leaf' }]);
    expect(result.repairs.map((repair) => repair.code)).toEqual(expect.arrayContaining([
      'orphan-parent', 'parent-cycle', 'contract-pair-parent', 'missing-coordinate', 'coordinate-frame', 'arc',
    ]));
  });

  it('refuses to guess how duplicate identifiers should be repaired', () => {
    const doc = simple();
    doc.contracts.push({ id: 'request', name: 'Other request' });
    expect(doctorNylonDocument(doc)).toMatchObject({ ok: false });
  });
});
