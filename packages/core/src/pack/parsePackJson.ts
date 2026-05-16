import Ajv from 'ajv';
import type {
  Pack, NodeKind, EdgeKind, View, Layer, DisclosureSchema,
  DisclosureLevel, PropsSchema,
} from '../types.ts';
import type { RenderNode } from '../render/types.ts';

const ajv = new Ajv({ strict: false });

function makePropsSchema(jsonSchema: Record<string, unknown>): PropsSchema {
  const validate = ajv.compile(jsonSchema);
  return {
    parse(input: unknown) {
      const ok = validate(input);
      if (!ok) throw new Error(`props validation failed: ${ajv.errorsText(validate.errors)}`);
      return input;
    },
    safeParse(input: unknown) {
      const ok = validate(input);
      if (ok) return { success: true as const, data: input };
      return { success: false as const, error: ajv.errorsText(validate.errors) };
    },
  };
}

function makeIdDerivation(template: string | undefined, kindId: string): (input: unknown) => string {
  if (!template) {
    return (_input: unknown) => `${kindId}.${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
  return (input: unknown) => {
    const props = input as Record<string, unknown>;
    return template.replace(/\{(\w+)(?:\|(\w+))?\}/g, (_match, field: string, transform: string | undefined) => {
      const value = String(props[field] ?? field);
      if (transform === 'slug') return value.toLowerCase().replace(/\s+/g, '-');
      return value;
    });
  };
}

interface RawNodeKind {
  id: string;
  label: string;
  props?: Record<string, unknown>;
  idTemplate?: string;
  defaultSize?: { w: number; h: number };
  render?: Record<string, RenderNode>;
}

interface RawEdgeKind {
  id: string;
  label: string;
  props?: Record<string, unknown>;
  directed?: boolean;
  acceptsSource?: string[];
  acceptsTarget?: string[];
  render?: Record<string, RenderNode>;
}

/**
 * Deserialize a parsed pack.json object into a runtime Pack.
 * Errors are descriptive; callers should catch and degrade to fallback rendering.
 */
export function deserializePack(raw: unknown): Pack {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('deserializePack: expected a JSON object at top level');
  }

  const file = raw as Record<string, unknown>;

  if (typeof file['id'] !== 'string' || !file['id']) {
    throw new Error('deserializePack: missing or invalid "id" field');
  }
  if (typeof file['version'] !== 'string') {
    throw new Error('deserializePack: missing or invalid "version" field');
  }

  const nodeKinds: NodeKind[] = [];
  const edgeKinds: EdgeKind[] = [];

  for (const raw of (Array.isArray(file['nodeKinds']) ? file['nodeKinds'] : []) as RawNodeKind[]) {
    if (typeof raw.id !== 'string') throw new Error('deserializePack: nodeKind missing "id"');
    const propsSchema = makePropsSchema(raw.props ?? { type: 'object' });
    const render: Partial<Record<DisclosureLevel, RenderNode>> = {};
    if (raw.render) {
      for (const [level, node] of Object.entries(raw.render)) {
        render[level as DisclosureLevel] = node;
      }
    }
    nodeKinds.push({
      id: raw.id,
      label: raw.label ?? raw.id,
      propsSchema,
      idDerivation: makeIdDerivation(raw.idTemplate, raw.id),
      defaultSize: raw.defaultSize,
      render: Object.keys(render).length > 0 ? render : undefined,
    });
  }

  for (const raw of (Array.isArray(file['edgeKinds']) ? file['edgeKinds'] : []) as RawEdgeKind[]) {
    if (typeof raw.id !== 'string') throw new Error('deserializePack: edgeKind missing "id"');
    const propsSchema = makePropsSchema(raw.props ?? { type: 'object' });
    const render: Partial<Record<DisclosureLevel, RenderNode>> = {};
    if (raw.render) {
      for (const [level, node] of Object.entries(raw.render)) {
        render[level as DisclosureLevel] = node;
      }
    }
    edgeKinds.push({
      id: raw.id,
      label: raw.label ?? raw.id,
      propsSchema,
      directed: raw.directed ?? false,
      acceptsSource: raw.acceptsSource,
      acceptsTarget: raw.acceptsTarget,
      render: Object.keys(render).length > 0 ? render : undefined,
    });
  }

  return {
    id: file['id'] as string,
    version: file['version'] as string,
    description: typeof file['description'] === 'string' ? file['description'] : undefined,
    nodeKinds,
    edgeKinds,
    views: Array.isArray(file['views']) ? (file['views'] as View[]) : [],
    layers: Array.isArray(file['layers']) ? (file['layers'] as Layer[]) : [],
    disclosureSchemas: Array.isArray(file['disclosure']) ? (file['disclosure'] as DisclosureSchema[]) : [],
  };
}

/** Parse a pack.json text string into a runtime Pack. */
export function parsePackJson(text: string): Pack {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`parsePackJson: invalid JSON: ${msg}`);
  }
  return deserializePack(raw);
}
