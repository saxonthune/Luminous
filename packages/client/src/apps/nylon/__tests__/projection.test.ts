import { describe, expect, it } from 'vitest';
import type { NylonDocument } from '@luminous/core/nylon';
import { EDGE_VISUAL_BAND, projectNylon } from '@luminous/core/nylon/projection';
import { executeNylonAction } from '@luminous/core/nylon/actions';
import { nylonContentsSchematic } from '@luminous/core/nylon/standardLayout';

describe('Standard View', () => {
  const doc: NylonDocument = {
    v: 1,
    transformations: [
      { id: 'outer', name: 'Outer', x: 800, y: 600 },
      { id: 'focus', name: 'Focus', parent: 'outer', x: 100, y: 90 },
      { id: 'child', name: 'Child', parent: 'focus', x: 80, y: 90 },
      { id: 'deep', name: 'Deep', parent: 'child', x: 50, y: 70 },
      { id: 'provider', name: 'Provider', contractPair: { input: 'request', output: 'response' } },
      { id: 'unrelated', name: 'Unrelated' },
      { id: 'tables', name: 'Tables', parent: 'focus', x: 400, y: 90 },
    ],
    contracts: [
      { id: 'internal', name: 'Internal', parent: 'child' },
      { id: 'table', name: 'Table', parent: 'tables' },
      { id: 'request', name: 'Request', x: 4000, y: 5000 },
      { id: 'response', name: 'Response', x: 4000, y: 5200 },
      { id: 'irrelevant', name: 'Irrelevant' },
    ],
    arcs: [
      { from: 'deep', to: 'request' },
      { from: 'response', to: 'deep' },
      { from: 'request', to: 'provider' },
      { from: 'provider', to: 'response' },
      { from: 'irrelevant', to: 'provider' },
      { from: 'internal', to: 'deep' },
    ],
  };
  const standard = (source: NylonDocument, focusId: string | null) =>
    projectNylon(source, undefined, undefined, undefined, undefined, { kind: 'standard', focusId });

  it('includes deep boundary endpoints without following their other connections or copying Nodes', () => {
    const before = JSON.stringify(doc);
    const view = standard(doc, 'focus');
    expect(view.nodes.map((node) => node.item.id).sort()).toEqual(['focus', 'child', 'tables', 'request', 'response'].sort());
    expect(view.edges.map((edge) => [edge.sourceId, edge.targetId])).toEqual([
      ['child', 'request'], ['response', 'child'],
    ]);
    expect(view.edges[0].id).toContain('deep->request');
    expect(view.nodes.find((node) => node.renderId === 'child')).toMatchObject({ state: 'collapsed', expanded: false });
    expect(view.nodes.find((node) => node.renderId === 'request')?.item).toBe(doc.contracts[2]);
    expect(view.contractFrames).toHaveLength(1);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('keeps Context Nodes outside the focused detail and stable across selection and disclosure', () => {
    const view = standard(doc, 'focus');
    const primary = view.nodes.filter((node) => !node.context);
    for (const node of view.nodes.filter((node) => node.context)) {
      expect(primary.every((child) => node.x + node.w < child.x || node.x > child.x + child.w)).toBe(true);
    }
    const selected = projectNylon(doc, new Set(['focus']), new Set(['child']),
      { x: 100, y: 100, width: 500, height: 500 }, new Set(['child']), { kind: 'standard', focusId: 'focus' });
    expect(selected.nodes).toEqual(view.nodes);
    expect(selected.edges.map((edge) => edge.id)).toEqual(view.edges.map((edge) => edge.id));
  });

  it('encloses Children even when they are moved left or above the focus origin', () => {
    const moved = { ...doc, transformations: doc.transformations.map((item) => item.id === 'child'
      ? { ...item, x: -500, y: -300 } : item) };
    const view = standard(moved, 'focus');
    const focus = view.nodes.find((node) => node.item.id === 'focus')!;
    for (const child of view.nodes.filter((node) => node.item.parent === 'focus')) {
      expect(child.x).toBeGreaterThan(focus.x);
      expect(child.y).toBeGreaterThan(focus.y + 38);
      expect(child.x + child.w).toBeLessThan(focus.x + focus.w);
      expect(child.y + child.h).toBeLessThan(focus.y + focus.h);
    }
    for (const context of view.nodes.filter((node) => node.context)) {
      expect(context.x + context.w < focus.x || context.x > focus.x + focus.w).toBe(true);
    }
    expect(moved.transformations.find((item) => item.id === 'child')).toMatchObject({ x: -500, y: -300 });
  });

  it('opens Contracts-only containers, simple Transformations, and root without revealing deeper contents', () => {
    expect(standard(doc, 'tables').nodes.map((node) => node.item.id)).toEqual(['tables', 'table']);
    expect(standard(doc, 'deep').nodes.map((node) => node.item.id).sort()).toEqual(['deep', 'internal', 'request', 'response'].sort());
    expect(standard(doc, null).nodes.map((node) => node.item.id).sort()).toEqual([
      'outer', 'provider', 'unrelated', 'request', 'response', 'irrelevant',
    ].sort());
    expect(standard(doc, 'missing')).toEqual({ nodes: [], edges: [], contractFrames: [] });
  });

  it('shows only the connected half of an external Contract Pair', () => {
    const view = standard({ ...doc, arcs: doc.arcs.filter((arc) => arc.from !== 'response') }, 'focus');
    expect(view.nodes.some((node) => node.item.id === 'response')).toBe(false);
    expect(view.contractFrames).toEqual([]);
  });

  it('shares child movement with Continuous View while leaving descendant coordinates intact', () => {
    const result = executeNylonAction(doc, { op: 'node.move', id: 'child', dx: 50, dy: 25 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const standardNode = standard(result.doc, 'focus').nodes.find((node) => node.item.id === 'child')!;
    const continuousNode = projectNylon(result.doc).nodes.find((node) => node.item.id === 'child')!;
    expect(standardNode).toMatchObject({ x: 130, y: 115 });
    expect(continuousNode).toMatchObject({ x: 1030, y: 805 });
    expect(result.doc.transformations.find((node) => node.id === 'deep')).toEqual(doc.transformations[3]);
  });

  it('compacts only immediate Children using card geometry, preserving graph and previews', () => {
    const before = JSON.stringify(doc);
    const preview = nylonContentsSchematic(doc, 'child');
    expect(preview.nodes.map((node) => node.id).sort()).toEqual(['deep', 'internal']);
    expect(preview.edges.map((edge) => [edge.sourceId, edge.targetId])).toEqual([['internal', 'deep']]);
    const result = executeNylonAction(doc, { op: 'layout.standard', focusId: 'focus' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const nodes = standard(result.doc, 'focus').nodes.filter((node) => !node.context && node.item.id !== 'focus');
    const [a, b] = nodes;
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    expect(result.doc.arcs).toEqual(doc.arcs);
    expect(result.doc.transformations.find((node) => node.id === 'deep')).toEqual(doc.transformations[3]);
    expect(result.doc.contracts).toEqual(doc.contracts);
    expect(JSON.stringify(doc)).toBe(before);
    expect(nylonContentsSchematic(result.doc, 'child').nodes).toEqual(preview.nodes);
  });

  it('arranges the root while preserving Contract Pair offsets and nested positions', () => {
    const result = executeNylonAction(doc, { op: 'layout.standard', focusId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const input = result.doc.contracts.find((item) => item.id === 'request')!;
    const output = result.doc.contracts.find((item) => item.id === 'response')!;
    expect(output.x! - input.x!).toBe(0);
    expect(output.y! - input.y!).toBe(200);
    expect(result.doc.transformations.find((item) => item.id === 'focus')).toEqual(doc.transformations[1]);
    expect(result.doc.arcs).toEqual(doc.arcs);
  });
});

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
