import { describe, expect, it } from 'vitest';
import type { NylonDocument } from '@luminous/core/nylon';
import { makeRoomForExpansion } from '@luminous/core/nylon/makeRoom';
import { DISCLOSURE_GAP, projectNylon } from '@luminous/core/nylon/projection';

describe('making room for Nylon disclosure', () => {
  it('persists both-axis sibling movement and does not undo it on collapse', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent', x: 0, y: 0 },
        { id: 'step', name: 'Step', parent: 'parent', x: 42, y: 80 },
      ],
      contracts: [{ id: 'later', name: 'Later', x: 200, y: 70 }],
      arcs: [],
    };

    const next = makeRoomForExpansion(doc, 'parent', new Set(['parent']));
    const expanded = projectNylon(next);
    const parent = expanded.nodes.find((node) => node.item.id === 'parent')!;
    const later = expanded.nodes.find((node) => node.item.id === 'later')!;

    expect(next).not.toBe(doc);
    expect(doc.contracts[0]).toMatchObject({ x: 200, y: 70 });
    expect(later.x).toBe(parent.x + parent.w + DISCLOSURE_GAP);
    expect(later.y).toBe(parent.y + parent.h + DISCLOSURE_GAP);
    expect(projectNylon(next, new Set(['parent'])).nodes.find((node) => node.item.id === 'later'))
      .toMatchObject({ x: later.x, y: later.y });
  });

  it('cascades movement through later siblings', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent', x: 0, y: 0 },
        { id: 'step', name: 'Step', parent: 'parent', x: 42, y: 80 },
      ],
      contracts: [
        { id: 'first', name: 'First', x: 200, y: 0 },
        { id: 'second', name: 'Second', x: 450, y: 0 },
      ],
      arcs: [],
    };

    const projection = projectNylon(makeRoomForExpansion(doc, 'parent', new Set(['parent'])));
    const first = projection.nodes.find((node) => node.item.id === 'first')!;
    const second = projection.nodes.find((node) => node.item.id === 'second')!;
    expect(second.x).toBe(first.x + first.w + DISCLOSURE_GAP);
  });

  it('percolates nested growth outward through ancestor sibling spaces', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'outer', name: 'Outer', x: 0, y: 0 },
        { id: 'inner', name: 'Inner', parent: 'outer', x: 0, y: 0 },
        { id: 'step', name: 'Step', parent: 'inner', x: 42, y: 80 },
      ],
      contracts: [
        { id: 'inner-later', name: 'Inner later', parent: 'outer', x: 200, y: 70 },
        { id: 'root-later', name: 'Root later', x: 480, y: 240 },
      ],
      arcs: [],
    };

    const projection = projectNylon(makeRoomForExpansion(doc, 'inner', new Set(['inner'])));
    const outer = projection.nodes.find((node) => node.item.id === 'outer')!;
    const inner = projection.nodes.find((node) => node.item.id === 'inner')!;
    const innerLater = projection.nodes.find((node) => node.item.id === 'inner-later')!;
    const rootLater = projection.nodes.find((node) => node.item.id === 'root-later')!;

    expect(innerLater.x).toBe(inner.x + inner.w + DISCLOSURE_GAP);
    expect(innerLater.y).toBe(inner.y + inner.h + DISCLOSURE_GAP);
    expect(rootLater.x).toBe(outer.x + outer.w + DISCLOSURE_GAP);
    expect(rootLater.y).toBe(outer.y + outer.h + DISCLOSURE_GAP);
  });

  it('moves a Contract Pair as one container unit', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent', x: 0, y: 0 },
        { id: 'step', name: 'Step', parent: 'parent', x: 42, y: 80 },
        { id: 'pair-owner', name: 'Boundary', x: 900, y: 0, contractPair: { input: 'request', output: 'result' } },
      ],
      contracts: [
        { id: 'request', name: 'Request', x: 200, y: 70 },
        { id: 'result', name: 'Result', x: 200, y: 210 },
      ],
      arcs: [],
    };

    const next = makeRoomForExpansion(doc, 'parent', new Set(['parent']));
    const request = next.contracts.find((item) => item.id === 'request')!;
    const result = next.contracts.find((item) => item.id === 'result')!;
    expect(request.x).toBeGreaterThan(200);
    expect(result.x! - 200).toBe(request.x! - 200);
    expect(result.y! - 210).toBe(request.y! - 70);
  });
});
