import { isAtlasColorToken } from './colors.ts';
import type { AtlasContent, AtlasDocument, AtlasEdge, AtlasNode } from './types.ts';

export type ParseAtlasDocumentResult =
  | { ok: true; doc: AtlasDocument }
  | { ok: false; issues: string[] };

export function emptyAtlasDocument(): AtlasDocument {
  return { v: 1, nodes: [], edges: [] };
}

const TOP_LEVEL_FIELDS = new Set(['v', 'nodes', 'edges']);
const NODE_FIELDS = new Set(['id', 'name', 'parent', 'content', 'x', 'y', 'color', 'contentHeight', 'contentWidth']);
const CONTENT_FIELDS = new Set(['text', 'mode']);
const EDGE_FIELDS = new Set(['from', 'to', 'label']);

function unknownFieldIssues(obj: Record<string, unknown>, allowed: Set<string>, path: string): string[] {
  return Object.keys(obj)
    .filter(key => !allowed.has(key))
    .map(key => `${path}: unknown field "${key}"`);
}

function parseContent(value: unknown, path: string, issues: string[]): AtlasContent | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: "content" must be an object`);
    return undefined;
  }
  const c = value as Record<string, unknown>;
  issues.push(...unknownFieldIssues(c, CONTENT_FIELDS, path));
  let ok = true;
  if (typeof c['text'] !== 'string') {
    issues.push(`${path}.text: must be a string`);
    ok = false;
  }
  if (c['mode'] !== 'markdown' && c['mode'] !== 'code') {
    issues.push(`${path}.mode: must be "markdown" or "code"`);
    ok = false;
  }
  if (!ok) return undefined;
  return { text: c['text'] as string, mode: c['mode'] as 'markdown' | 'code' };
}

function parseNode(value: unknown, path: string, issues: string[]): AtlasNode | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: node must be an object`);
    return undefined;
  }
  const n = value as Record<string, unknown>;
  issues.push(...unknownFieldIssues(n, NODE_FIELDS, path));
  let ok = true;
  if (typeof n['id'] !== 'string') {
    issues.push(`${path}.id: must be a string`);
    ok = false;
  }
  if (typeof n['name'] !== 'string') {
    issues.push(`${path}.name: must be a string`);
    ok = false;
  }
  if (n['parent'] !== undefined && typeof n['parent'] !== 'string') {
    issues.push(`${path}.parent: must be a string`);
    ok = false;
  }
  let content: AtlasContent | undefined;
  if (n['content'] !== undefined) {
    content = parseContent(n['content'], `${path}.content`, issues);
    if (content === undefined) ok = false;
  }
  if ((n['x'] !== undefined) !== (n['y'] !== undefined)) {
    issues.push(`${path}: "x" and "y" must appear together`);
    ok = false;
  }
  if (n['x'] !== undefined && !(typeof n['x'] === 'number' && Number.isFinite(n['x']))) {
    issues.push(`${path}.x: must be a finite number`);
    ok = false;
  }
  if (n['y'] !== undefined && !(typeof n['y'] === 'number' && Number.isFinite(n['y']))) {
    issues.push(`${path}.y: must be a finite number`);
    ok = false;
  }
  if (n['color'] !== undefined && !isAtlasColorToken(n['color'])) {
    issues.push(`${path}.color: unrecognized color token "${String(n['color'])}"`);
    ok = false;
  }
  if (
    n['contentHeight'] !== undefined &&
    !(typeof n['contentHeight'] === 'number' && Number.isFinite(n['contentHeight']))
  ) {
    issues.push(`${path}.contentHeight: must be a finite number`);
    ok = false;
  }
  if (
    n['contentWidth'] !== undefined &&
    !(typeof n['contentWidth'] === 'number' && Number.isFinite(n['contentWidth']))
  ) {
    issues.push(`${path}.contentWidth: must be a finite number`);
    ok = false;
  }
  if (!ok) return undefined;
  const node: AtlasNode = { id: n['id'] as string, name: n['name'] as string };
  if (n['parent'] !== undefined) node.parent = n['parent'] as string;
  if (content !== undefined) node.content = content;
  if (n['x'] !== undefined) node.x = n['x'] as number;
  if (n['y'] !== undefined) node.y = n['y'] as number;
  if (n['color'] !== undefined) node.color = n['color'] as AtlasNode['color'];
  if (n['contentHeight'] !== undefined) node.contentHeight = n['contentHeight'] as number;
  if (n['contentWidth'] !== undefined) node.contentWidth = n['contentWidth'] as number;
  return node;
}

function parseEdge(value: unknown, path: string, issues: string[]): AtlasEdge | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: edge must be an object`);
    return undefined;
  }
  const e = value as Record<string, unknown>;
  // "label" is a legacy field from before edges dropped labels (see
  // atlas-edge-operations plan) — tolerated silently, not in EDGE_FIELDS below.
  issues.push(...unknownFieldIssues(e, EDGE_FIELDS, path));
  let ok = true;
  if (typeof e['from'] !== 'string') {
    issues.push(`${path}.from: must be a string`);
    ok = false;
  }
  if (typeof e['to'] !== 'string') {
    issues.push(`${path}.to: must be a string`);
    ok = false;
  }
  if (!ok) return undefined;
  return { from: e['from'] as string, to: e['to'] as string };
}

/** Walk each node's parent chain; report a cycle's member ids in the issue text. */
function parentCycleIssues(nodes: AtlasNode[]): string[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const issues: string[] = [];
  const reported = new Set<string>();

  for (const node of nodes) {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current: AtlasNode | undefined = node;
    while (current) {
      if (visited.has(current.id)) {
        const cycleStart = chain.indexOf(current.id);
        const cycle = chain.slice(cycleStart);
        if (!cycle.some(id => reported.has(id))) {
          for (const id of cycle) reported.add(id);
          issues.push(`parent cycle: ${cycle.join(' -> ')} -> ${current.id}`);
        }
        break;
      }
      visited.add(current.id);
      chain.push(current.id);
      current = current.parent !== undefined ? byId.get(current.parent) : undefined;
    }
  }
  return issues;
}

export function parseAtlasDocument(text: string): ParseAtlasDocumentResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [`invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, issues: ['document must be a non-null, non-array JSON object'] };
  }

  const obj = parsed as Record<string, unknown>;
  const issues: string[] = unknownFieldIssues(obj, TOP_LEVEL_FIELDS, '');

  if (typeof obj['v'] !== 'number') {
    issues.push('v: must be a number');
  }

  const nodes: AtlasNode[] = [];
  if (!Array.isArray(obj['nodes'])) {
    issues.push('nodes: must be an array');
  } else {
    const seenIds = new Set<string>();
    (obj['nodes'] as unknown[]).forEach((value, i) => {
      const node = parseNode(value, `nodes[${i}]`, issues);
      if (node === undefined) return;
      if (seenIds.has(node.id)) {
        issues.push(`nodes[${i}].id: duplicate node id "${node.id}"`);
      }
      seenIds.add(node.id);
      nodes.push(node);
    });

    nodes.forEach((node, i) => {
      if (node.parent !== undefined && !seenIds.has(node.parent)) {
        issues.push(`nodes[${i}].parent: references unknown node id "${node.parent}"`);
      }
    });

    issues.push(...parentCycleIssues(nodes));
  }

  const edges: AtlasEdge[] = [];
  if (!Array.isArray(obj['edges'])) {
    issues.push('edges: must be an array');
  } else {
    const nodeIds = new Set(nodes.map(n => n.id));
    (obj['edges'] as unknown[]).forEach((value, i) => {
      const edge = parseEdge(value, `edges[${i}]`, issues);
      if (edge === undefined) return;
      if (!nodeIds.has(edge.from)) {
        issues.push(`edges[${i}].from: references unknown node id "${edge.from}"`);
      }
      if (!nodeIds.has(edge.to)) {
        issues.push(`edges[${i}].to: references unknown node id "${edge.to}"`);
      }
      edges.push(edge);
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, doc: { v: obj['v'] as number, nodes, edges } };
}

function serializeContent(content: AtlasContent): Record<string, unknown> {
  return { text: content.text, mode: content.mode };
}

function serializeNode(node: AtlasNode): Record<string, unknown> {
  const out: Record<string, unknown> = { id: node.id, name: node.name };
  if (node.parent !== undefined) out['parent'] = node.parent;
  if (node.content !== undefined) out['content'] = serializeContent(node.content);
  if (node.x !== undefined) out['x'] = node.x;
  if (node.y !== undefined) out['y'] = node.y;
  if (node.color !== undefined) out['color'] = node.color;
  if (node.contentHeight !== undefined) out['contentHeight'] = node.contentHeight;
  if (node.contentWidth !== undefined) out['contentWidth'] = node.contentWidth;
  return out;
}

function serializeEdge(edge: AtlasEdge): Record<string, unknown> {
  return { from: edge.from, to: edge.to };
}

export function serializeAtlasDocument(doc: AtlasDocument): string {
  const out = {
    v: doc.v,
    nodes: doc.nodes.map(serializeNode),
    edges: doc.edges.map(serializeEdge),
  };
  return JSON.stringify(out, null, 2) + '\n';
}
