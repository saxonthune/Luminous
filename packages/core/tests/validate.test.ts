import { describe, it, expect } from 'vitest';
import { validateGraphAndPack } from '../src/validate.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalPack(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'test-pack',
    version: '1.0.0',
    nodeKinds: [
      { id: 'test.node', label: 'Node', props: { type: 'object' } },
    ],
    edgeKinds: [
      { id: 'test.edge', label: 'Edge', props: { type: 'object' } },
    ],
    views: [
      {
        id: 'main',
        name: 'Main',
        nodeRoles: { 'test.node': 'spatial' },
        edgeRoles: { 'test.edge': 'arrow' },
      },
    ],
    ...overrides,
  });
}

function minimalGraph(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 3,
    pack: 'test-pack',
    nodes: [{ id: 'n1', kind: 'test.node' }],
    edges: [{ id: 'e1', kind: 'test.edge', from: 'n1', to: 'n1' }],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — happy path', () => {
  it('returns valid: true for a well-formed graph + pack pair', () => {
    const result = validateGraphAndPack(minimalGraph(), minimalPack());
    expect(result.valid).toBe(true);
    const errors = result.issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pack render checks
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — flat render mistake', () => {
  it('emits error when render is a flat RenderNode instead of a level map', () => {
    const pack = minimalPack({
      nodeKinds: [
        {
          id: 'test.node',
          label: 'Node',
          props: { type: 'object' },
          render: { type: 'card', children: [{ type: 'text' }] },
        },
      ],
    });
    const result = validateGraphAndPack(minimalGraph(), pack);
    expect(result.valid).toBe(false);
    const renderErrors = result.issues.filter(
      i => i.severity === 'error' && i.path.includes('render')
    );
    expect(renderErrors.length).toBeGreaterThan(0);
    const msg = renderErrors[0].message;
    expect(msg).toMatch(/disclosure level/i);
    expect(msg).toMatch(/peek|card|open|deep/);
  });
});

describe('validateGraphAndPack — unknown render primitive', () => {
  it('emits error for an unknown primitive type in render', () => {
    const pack = minimalPack({
      nodeKinds: [
        {
          id: 'test.node',
          label: 'Node',
          props: { type: 'object' },
          render: { card: { type: 'super-widget' } },
        },
      ],
    });
    const result = validateGraphAndPack(minimalGraph(), pack);
    expect(result.valid).toBe(false);
    const err = result.issues.find(
      i => i.severity === 'error' && i.message.includes('super-widget')
    );
    expect(err).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// View role checks
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — view nodeRoles unknown kind', () => {
  it('emits error when nodeRoles references an unknown kind id', () => {
    const pack = minimalPack({
      views: [
        {
          id: 'main',
          name: 'Main',
          nodeRoles: { 'nonexistent.kind': 'spatial' },
          edgeRoles: {},
        },
      ],
    });
    const result = validateGraphAndPack(minimalGraph(), pack);
    expect(result.valid).toBe(false);
    const err = result.issues.find(
      i => i.severity === 'error' && i.message.includes('nonexistent.kind')
    );
    expect(err).toBeDefined();
  });
});

describe('validateGraphAndPack — view role invalid value', () => {
  it('emits error when nodeRoles value is not a valid role', () => {
    const pack = minimalPack({
      views: [
        {
          id: 'main',
          name: 'Main',
          nodeRoles: { 'test.node': 'invisible' },
          edgeRoles: {},
        },
      ],
    });
    const result = validateGraphAndPack(minimalGraph(), pack);
    expect(result.valid).toBe(false);
    const err = result.issues.find(
      i => i.severity === 'error' && i.message.includes('invisible')
    );
    expect(err).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// defaultView
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — defaultView mismatch', () => {
  it('emits error when defaultView does not match any view id', () => {
    const graph = minimalGraph({ defaultView: 'no-such-view' });
    const result = validateGraphAndPack(graph, minimalPack());
    expect(result.valid).toBe(false);
    const err = result.issues.find(
      i => i.severity === 'error' && i.path === 'defaultView'
    );
    expect(err).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Graph edge endpoint checks
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — edge from missing node', () => {
  it('emits error when edge from references a missing node id', () => {
    const graph = JSON.stringify({
      version: 3,
      pack: 'test-pack',
      nodes: [{ id: 'n1', kind: 'test.node' }],
      edges: [{ id: 'e1', kind: 'test.edge', from: 'ghost', to: 'n1' }],
    });
    const result = validateGraphAndPack(graph, minimalPack());
    expect(result.valid).toBe(false);
    const err = result.issues.find(
      i => i.severity === 'error' && i.message.includes('ghost')
    );
    expect(err).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Unknown node kind
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — unknown node kind', () => {
  it('emits error when a node kind is not in the pack', () => {
    const graph = JSON.stringify({
      version: 3,
      pack: 'test-pack',
      nodes: [{ id: 'n1', kind: 'unknown.kind' }],
      edges: [],
    });
    const result = validateGraphAndPack(graph, minimalPack());
    expect(result.valid).toBe(false);
    const err = result.issues.find(
      i => i.severity === 'error' && i.message.includes('unknown.kind')
    );
    expect(err).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Props schema validation
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — props schema violation', () => {
  it('emits error when node props violate the kind schema', () => {
    const pack = JSON.stringify({
      id: 'test-pack',
      version: '1.0.0',
      nodeKinds: [
        {
          id: 'test.node',
          label: 'Node',
          props: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
      ],
      edgeKinds: [],
      views: [
        { id: 'main', name: 'Main', nodeRoles: { 'test.node': 'spatial' }, edgeRoles: {} },
      ],
    });
    const graph = JSON.stringify({
      version: 3,
      pack: 'test-pack',
      nodes: [{ id: 'n1', kind: 'test.node', props: { name: 42 } }],
      edges: [],
    });
    const result = validateGraphAndPack(graph, pack);
    expect(result.valid).toBe(false);
    const err = result.issues.find(i => i.severity === 'error' && i.path.includes('props'));
    expect(err).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Duplicate ids
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — duplicate node ids', () => {
  it('emits error for duplicate node ids in graph', () => {
    const graph = JSON.stringify({
      version: 3,
      pack: 'test-pack',
      nodes: [
        { id: 'n1', kind: 'test.node' },
        { id: 'n1', kind: 'test.node' },
      ],
      edges: [],
    });
    const result = validateGraphAndPack(graph, minimalPack());
    expect(result.valid).toBe(false);
    const err = result.issues.find(i => i.severity === 'error' && i.message.includes('duplicate') && i.message.includes('n1'));
    expect(err).toBeDefined();
  });
});

describe('validateGraphAndPack — duplicate kind ids in pack', () => {
  it('emits error for duplicate node-kind ids in pack', () => {
    const pack = JSON.stringify({
      id: 'test-pack',
      version: '1.0.0',
      nodeKinds: [
        { id: 'test.node', label: 'Node A', props: { type: 'object' } },
        { id: 'test.node', label: 'Node B', props: { type: 'object' } },
      ],
      edgeKinds: [],
    });
    const graph = minimalGraph();
    const result = validateGraphAndPack(graph, pack);
    expect(result.valid).toBe(false);
    const err = result.issues.find(i => i.severity === 'error' && i.message.includes('duplicate') && i.message.includes('test.node'));
    expect(err).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Warning: kind not in any view
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — kind not in any view', () => {
  it('emits a warning (not error) when a kind is absent from all views', () => {
    const pack = JSON.stringify({
      id: 'test-pack',
      version: '1.0.0',
      nodeKinds: [
        { id: 'test.node', label: 'Node', props: { type: 'object' } },
        { id: 'orphan.node', label: 'Orphan', props: { type: 'object' } },
      ],
      edgeKinds: [],
      views: [
        {
          id: 'main',
          name: 'Main',
          nodeRoles: { 'test.node': 'spatial' },
          edgeRoles: {},
        },
      ],
    });
    const graph = JSON.stringify({
      version: 3,
      pack: 'test-pack',
      nodes: [{ id: 'n1', kind: 'test.node' }],
      edges: [],
    });
    const result = validateGraphAndPack(graph, pack);
    expect(result.valid).toBe(true);
    const w = result.issues.find(i => i.severity === 'warning' && i.message.includes('orphan.node'));
    expect(w).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Malformed JSON
// ---------------------------------------------------------------------------

describe('validateGraphAndPack — malformed pack JSON', () => {
  it('emits a single pack error and still runs graph structural checks', () => {
    const graph = minimalGraph();
    const result = validateGraphAndPack(graph, '{bad json');
    // pack should have exactly one error
    const packErrors = result.issues.filter(i => i.scope === 'pack' && i.severity === 'error');
    expect(packErrors).toHaveLength(1);
    // graph structural checks still ran — version 3 was valid so no graph version error
    const graphVersionErrors = result.issues.filter(i => i.scope === 'graph' && i.path === 'version');
    expect(graphVersionErrors).toHaveLength(0);
  });
});
