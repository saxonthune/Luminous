import { describe, it, expect } from 'vitest';
import { parsePackJson, deserializePack } from '../src/pack/parsePackJson.ts';

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('parsePackJson — happy path', () => {
  it('parses a minimal valid pack.json', () => {
    const text = JSON.stringify({
      id: 'my-pack',
      version: '1.0.0',
      nodeKinds: [],
      edgeKinds: [],
    });
    const pack = parsePackJson(text);
    expect(pack.id).toBe('my-pack');
    expect(pack.version).toBe('1.0.0');
    expect(pack.nodeKinds).toHaveLength(0);
    expect(pack.edgeKinds).toHaveLength(0);
  });

  it('parses a node kind with JSON-Schema props', () => {
    const text = JSON.stringify({
      id: 'test-pack',
      version: '0.1.0',
      nodeKinds: [
        {
          id: 'test.node',
          label: 'Node',
          props: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
      ],
      edgeKinds: [],
    });
    const pack = parsePackJson(text);
    expect(pack.nodeKinds).toHaveLength(1);
    expect(pack.nodeKinds[0].id).toBe('test.node');

    // props schema should accept valid data
    const valid = pack.nodeKinds[0].propsSchema.safeParse({ name: 'hello' });
    expect(valid.success).toBe(true);

    // props schema should reject invalid data
    const invalid = pack.nodeKinds[0].propsSchema.safeParse({ name: 42 });
    expect(invalid.success).toBe(false);
  });

  it('parses an edge kind with directed flag', () => {
    const text = JSON.stringify({
      id: 'test-pack',
      version: '0.1.0',
      nodeKinds: [],
      edgeKinds: [
        {
          id: 'test.link',
          label: 'Link',
          props: { type: 'object' },
          directed: true,
        },
      ],
    });
    const pack = parsePackJson(text);
    expect(pack.edgeKinds[0].directed).toBe(true);
  });

  it('attaches a render RenderNode to node kind', () => {
    const renderNode = { type: 'card', children: [{ type: 'text', value: 'hi' }] };
    const text = JSON.stringify({
      id: 'test-pack',
      version: '0.1.0',
      nodeKinds: [
        {
          id: 'test.node',
          label: 'Node',
          props: { type: 'object' },
          render: { card: renderNode },
        },
      ],
      edgeKinds: [],
    });
    const pack = parsePackJson(text);
    expect(pack.nodeKinds[0].render?.['card']).toEqual(renderNode);
  });

  it('parses views, layers and disclosure arrays', () => {
    const text = JSON.stringify({
      id: 'test-pack',
      version: '0.1.0',
      nodeKinds: [],
      edgeKinds: [],
      views: [
        {
          id: 'v1',
          name: 'View One',
          nodeRoles: {},
          edgeRoles: {},
          layers: {},
          layout: { algorithm: 'manual' },
        },
      ],
      layers: [],
      disclosure: [
        { kind: 'test.node', peek: ['name'], card: ['name'], open: ['name'], deep: ['name'] },
      ],
    });
    const pack = parsePackJson(text);
    expect(pack.views).toHaveLength(1);
    expect(pack.views[0].id).toBe('v1');
    expect(pack.disclosureSchemas).toHaveLength(1);
    expect(pack.disclosureSchemas[0].kind).toBe('test.node');
  });

  it('idDerivation template {field|slug} produces slugified value', () => {
    const text = JSON.stringify({
      id: 'test-pack',
      version: '0.1.0',
      nodeKinds: [
        {
          id: 'test.node',
          label: 'Node',
          props: { type: 'object' },
          idTemplate: 'node.{label|slug}',
        },
      ],
      edgeKinds: [],
    });
    const pack = parsePackJson(text);
    const id = pack.nodeKinds[0].idDerivation({ label: 'My Node' });
    expect(id).toBe('node.my-node');
  });

  it('parses the shipped primitives.pack.json without error', async () => {
    const { getPrimitivesBuiltin } = await import('../src/pack/builtins.ts');
    const pack = getPrimitivesBuiltin();
    expect(pack.id).toBe('primitives');
    expect(pack.nodeKinds.some((k) => k.id === 'prim.box')).toBe(true);
    expect(pack.edgeKinds.some((k) => k.id === 'prim.arrow')).toBe(true);
    expect(pack.edgeKinds.some((k) => k.id === 'prim.contains')).toBe(true);
    expect(pack.views.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Props validation via JSON Schema
// ---------------------------------------------------------------------------

describe('parsePackJson — JSON-Schema props validation', () => {
  it('safeParse returns true for conforming props', () => {
    const text = JSON.stringify({
      id: 'p',
      version: '1.0.0',
      nodeKinds: [
        {
          id: 'p.box',
          label: 'Box',
          props: {
            type: 'object',
            properties: { label: { type: 'string' } },
            required: ['label'],
            additionalProperties: false,
          },
        },
      ],
      edgeKinds: [],
    });
    const pack = parsePackJson(text);
    const result = pack.nodeKinds[0].propsSchema.safeParse({ label: 'Alpha' });
    expect(result.success).toBe(true);
  });

  it('safeParse returns false when required field is missing', () => {
    const text = JSON.stringify({
      id: 'p',
      version: '1.0.0',
      nodeKinds: [
        {
          id: 'p.box',
          label: 'Box',
          props: {
            type: 'object',
            properties: { label: { type: 'string' } },
            required: ['label'],
          },
        },
      ],
      edgeKinds: [],
    });
    const pack = parsePackJson(text);
    const result = pack.nodeKinds[0].propsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

describe('parsePackJson — malformed input', () => {
  it('throws on invalid JSON text', () => {
    expect(() => parsePackJson('{not json')).toThrow(/invalid JSON/i);
  });

  it('throws when "id" field is missing', () => {
    const text = JSON.stringify({ version: '1.0.0', nodeKinds: [], edgeKinds: [] });
    expect(() => parsePackJson(text)).toThrow(/"id"/);
  });

  it('throws when "version" field is missing', () => {
    const text = JSON.stringify({ id: 'p', nodeKinds: [], edgeKinds: [] });
    expect(() => parsePackJson(text)).toThrow(/"version"/);
  });

  it('throws on non-object top level', () => {
    expect(() => parsePackJson('[]')).toThrow(/expected a JSON object/i);
  });

  it('deserializePack throws on non-object input', () => {
    expect(() => deserializePack('a string')).toThrow(/expected a JSON object/i);
  });
});
