import { describe, expect, it } from 'vitest';
import type { NylonDocument } from '@luminous/core/nylon';
import { EDGE_VISUAL_BAND, projectNylon } from '@luminous/core/nylon/projection';

describe('Nylon projection', () => {
  it('covers without resizing ancestors or moving nodes, and preserves nested disclosure', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'outer', name: 'Outer', x: 100, y: 100 },
        { id: 'parent', name: 'Parent', parent: 'outer', x: 42, y: 80 },
        { id: 'nested', name: 'Nested', parent: 'parent', x: 400, y: 200 },
        { id: 'step', name: 'Step', parent: 'nested', x: 300, y: 300 },
      ],
      contracts: [
        { id: 'input', name: 'Input', x: 0, y: 0 },
        { id: 'internal', name: 'Internal', parent: 'parent', x: 42, y: 100 },
      ],
      arcs: [{ from: 'input', to: 'step' }, { from: 'internal', to: 'step' }],
    };
    const original = JSON.stringify(doc);
    const collapsed = new Set(['nested']);
    const expanded = projectNylon(doc, collapsed);
    const covered = projectNylon(doc, collapsed, undefined, undefined, new Set(['parent']));
    for (const id of ['outer', 'parent', 'input']) {
      const before = expanded.nodes.find((node) => node.renderId === id)!;
      expect(covered.nodes.find((node) => node.renderId === id)).toMatchObject({
        x: before.x, y: before.y, w: before.w, h: before.h,
      });
    }
    expect(covered.nodes.map((node) => node.renderId)).toEqual(['outer', 'input', 'parent']);
    expect(covered.nodes.find((node) => node.renderId === 'parent')).toMatchObject({ state: 'covered', expanded: false });
    expect(covered.edges).toHaveLength(1);
    expect(covered.edges[0]).toMatchObject({ sourceId: 'input', targetId: 'parent' });
    const revealed = projectNylon(doc, collapsed);
    expect(revealed.nodes.find((node) => node.renderId === 'nested')).toMatchObject({ state: 'collapsed' });
    expect(revealed.nodes.some((node) => node.renderId === 'step')).toBe(false);
    expect(JSON.stringify(doc)).toBe(original);
  });

  it('routes edges above containers and keeps their endpoints on node boundaries', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent' },
        { id: 'step', name: 'Step', parent: 'parent', x: 300, y: 100 },
      ],
      contracts: [{ id: 'input', name: 'Input', text: '{}', x: 0, y: 135 }],
      arcs: [{ from: 'input', to: 'step' }],
    };

    const projection = projectNylon(doc);
    expect(projection.nodes.find((node) => node.item.id === 'parent')?.kind).toBe('container');

    const edge = projection.edges[0];
    const route = edge.routeBuilder?.(new Map([
      ['input', { x: 0, y: 135, w: 220, h: 110 }],
      ['step', { x: 300, y: 100, w: 180, h: 180 }],
    ]));

    expect(edge.styling).toMatchObject({ colorToken: 'fg-muted', width: 2.25 });
    expect(route?.segmentLayers).toEqual([EDGE_VISUAL_BAND]);
    expect(route?.points[0].x).toBe(220);
    expect(route?.points[1].x).toBe(300);
  });

  it('projects co-located input and output Contracts as one Contract Pair', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [{
        id: 'service',
        name: 'CustomerService.cs',
        contractPair: { input: 'request', output: 'result' },
      }],
      contracts: [
        { id: 'request', name: 'Request', text: '{}', x: 100, y: 100 },
        { id: 'result', name: 'Result', text: '{}', x: 100, y: 240 },
      ],
      arcs: [],
    };

    const frame = projectNylon(doc).contractFrames[0];
    expect(frame).toMatchObject({
      id: 'service-contract-pair',
      transformationId: 'service',
      name: 'CustomerService.cs',
      input: 'request',
      output: 'result',
    });
    expect(frame.x).toBeLessThan(100);
    expect(frame.y).toBeLessThan(100);
    expect(frame.h).toBeGreaterThan(250);
  });

  it('resolves Child coordinates through nested Parent Transformations', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'outer', name: 'Outer', x: 100, y: 200 },
        { id: 'inner', name: 'Inner', parent: 'outer', x: 40, y: 80 },
        { id: 'step', name: 'Step', parent: 'inner', x: 30, y: 70 },
      ],
      contracts: [],
      arcs: [],
    };

    const step = projectNylon(doc).nodes.find((node) => node.item.id === 'step');
    expect(step).toMatchObject({ x: 170, y: 350 });
  });

  it('hides descendants and redirects crossing Arcs to a collapsed Parent Transformation', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent', x: 300, y: 100 },
        { id: 'step', name: 'Step', parent: 'parent', x: 42, y: 80 },
      ],
      contracts: [{ id: 'input', name: 'Input', x: 0, y: 135 }],
      arcs: [{ from: 'input', to: 'step' }],
    };

    const projection = projectNylon(doc, new Set(['parent']));
    expect(projection.nodes.some((node) => node.item.id === 'step')).toBe(false);
    expect(projection.nodes.find((node) => node.item.id === 'parent')).toMatchObject({
      kind: 'container', expanded: false,
    });
    expect(projection.edges[0]).toMatchObject({ sourceId: 'input', targetId: 'parent' });
  });

  it('leaves a non-colliding sibling at its stored position', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'parent', name: 'Parent', x: 0, y: 0 },
        { id: 'step', name: 'Step', parent: 'parent', x: 42, y: 80 },
      ],
      contracts: [{ id: 'later', name: 'Later', x: 400, y: 400 }],
      arcs: [],
    };

    const expanded = projectNylon(doc);
    const collapsed = projectNylon(doc, new Set(['parent']));
    expect(expanded.nodes.find((node) => node.item.id === 'later')).toMatchObject({ x: 400, y: 400 });
    expect(collapsed.nodes.find((node) => node.item.id === 'later')).toMatchObject({ x: 400, y: 400 });
    expect(projectNylon(doc).nodes.find((node) => node.item.id === 'later')).toMatchObject({ x: 400, y: 400 });
  });

  it('projects an external Contract Pair into its selected caller container', () => {
    const doc: NylonDocument = {
      v: 1,
      transformations: [
        { id: 'repository', name: 'Repository', x: 0, y: 0 },
        { id: 'prepare', name: 'Prepare query', parent: 'repository', x: 60, y: 100 },
        { id: 'materialize', name: 'Materialize row', parent: 'repository', x: 720, y: 100 },
        {
          id: 'database', name: 'Database', x: 1200, y: 0,
          contractPair: { input: 'sql-query', output: 'sql-result' },
        },
      ],
      contracts: [
        { id: 'sql-query', name: 'SQL query', x: 1200, y: 100 },
        { id: 'sql-result', name: 'SQL result', x: 1200, y: 280 },
      ],
      arcs: [
        { from: 'prepare', to: 'sql-query' },
        { from: 'sql-result', to: 'materialize' },
      ],
    };

    const quiet = projectNylon(doc);
    expect(quiet.edges.find((edge) => edge.id.includes(':summary'))).toMatchObject({
      sourceId: 'prepare', targetId: 'materialize', styling: { dash: 'dotted' },
    });
    expect(quiet.contractFrames).toHaveLength(1);

    const selected = projectNylon(doc, new Set(), new Set(['prepare']));
    const boundaryFrame = selected.contractFrames.find((frame) => frame.boundaryContainerId === 'repository');
    expect(boundaryFrame).toBeDefined();
    expect(boundaryFrame?.compact).toBe(true);
    const projectedContracts = selected.nodes.filter((node): node is Extract<(typeof selected.nodes)[number], { kind: 'contract' }> => (
      node.kind === 'contract' && node.boundaryContainerId === 'repository'
    ));
    expect(projectedContracts).toHaveLength(2);
    expect(projectedContracts.every((node) => node.compact && node.w < 220 && node.h < 110)).toBe(true);
    expect(selected.edges.some((edge) => edge.id.includes(':summary'))).toBe(false);
    expect(selected.edges.filter((edge) => edge.id.includes('boundary:repository:database')))
      .toHaveLength(2);
  });

});
