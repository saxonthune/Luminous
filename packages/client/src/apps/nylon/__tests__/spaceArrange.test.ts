import { describe, expect, it } from 'vitest';
import type { NylonDocument } from '@luminous/core/nylon';
import { projectNylon } from '@luminous/core/nylon/projection';
import { NYLON_SPACE_LAYOUT, spaceNylonContainer } from '@luminous/core/nylon/spaceArrange';

describe('spaceNylonContainer', () => {
  it('spaces direct children, preserves descendants, and clears ancestor sibling overlaps', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'controller', name: 'Controller', x: 0, y: 0 },
        { id: 'get', name: 'GET', parent: 'controller', x: 42, y: 80 },
        { id: 'get-step', name: 'GET step', parent: 'get', x: 42, y: 80 },
        { id: 'put', name: 'PUT', parent: 'controller', x: 42, y: 80 },
        { id: 'put-step', name: 'PUT step', parent: 'put', x: 42, y: 80 },
      ],
      contracts: [{ id: 'root-sibling', name: 'Root sibling', x: 300, y: 0 }],
      arcs: [],
    };

    const result = spaceNylonContainer(doc, projectNylon(doc), 'controller');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.transformations.find((item) => item.id === 'get-step')).toMatchObject({ x: 42, y: 80 });
    expect(result.doc.transformations.find((item) => item.id === 'put-step')).toMatchObject({ x: 42, y: 80 });

    const projection = projectNylon(result.doc);
    const get = projection.nodes.find((node) => node.item.id === 'get')!;
    const put = projection.nodes.find((node) => node.item.id === 'put')!;
    const controller = projection.nodes.find((node) => node.item.id === 'controller')!;
    const sibling = projection.nodes.find((node) => node.item.id === 'root-sibling')!;
    expect(put.x).toBeGreaterThanOrEqual(get.x + get.w + NYLON_SPACE_LAYOUT.gap);
    expect(sibling.x).toBeGreaterThanOrEqual(controller.x + controller.w + NYLON_SPACE_LAYOUT.gap);
    expect(sibling.y).toBeGreaterThanOrEqual(controller.y + controller.h + NYLON_SPACE_LAYOUT.gap);
  });

  it('moves both Contracts in a direct Contract Pair as one geometry unit', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent', x: 0, y: 0 },
        { id: 'step', name: 'Step', parent: 'parent', x: 42, y: 80 },
        { id: 'remote', name: 'Remote', x: 900, y: 0, contractPair: { input: 'request', output: 'result' } },
      ],
      contracts: [
        { id: 'request', name: 'Request', parent: 'parent', x: 42, y: 80 },
        { id: 'result', name: 'Result', parent: 'parent', x: 42, y: 230 },
      ],
      arcs: [],
    };

    const result = spaceNylonContainer(doc, projectNylon(doc), 'parent');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const request = result.doc.contracts.find((item) => item.id === 'request')!;
    const response = result.doc.contracts.find((item) => item.id === 'result')!;
    expect(request.x! - 42).toBe(response.x! - 42);
    expect(request.y! - 80).toBe(response.y! - 230);
  });
});
