import { isMerinoColorToken } from './colors.ts';
import { MERINO_CURRENT_VERSION, migrateMerinoDocument } from './migrate.ts';
import { isMerinoContainerLayout, isMerinoDash, isMerinoPortSide, isMerinoTab } from './types.ts';
import type {
  MerinoDocument,
  MerinoEdge,
  MerinoEdgeType,
  MerinoNode,
  MerinoNodeType,
  MerinoOverviewConfig,
  MerinoPortPosition,
  MerinoPorts,
} from './types.ts';

export type ParseMerinoDocumentResult =
  | { ok: true; doc: MerinoDocument }
  | { ok: false; issues: string[] };

/** The starter Node Types every new Document carries (requirements T1). Each is
 * a plain Type the user may rename, recolor, or remove. */
export const SEED_NODE_TYPES: MerinoNodeType[] = [
  { id: 'event', name: 'Event', color: 'accent-4' },
  { id: 'requirement', name: 'Requirement', color: 'accent-2' },
  { id: 'resource', name: 'Resource', color: 'accent-6' },
  { id: 'deployment', name: 'Deployment', color: 'accent-1' },
];

/** The starter Edge Types — enough to draw the worked example's
 * event → requirement → resource graph out of the box. */
export const SEED_EDGE_TYPES: MerinoEdgeType[] = [
  { id: 'triggers', name: 'triggers', color: 'accent-4', dash: 'solid', arrowHead: true, directed: true },
  { id: 'needs', name: 'needs', color: 'accent-6', dash: 'solid', arrowHead: true, directed: true },
];

export function emptyMerinoDocument(): MerinoDocument {
  return {
    v: MERINO_CURRENT_VERSION,
    nodeTypes: SEED_NODE_TYPES.map(t => ({ ...t })),
    edgeTypes: SEED_EDGE_TYPES.map(t => ({ ...t })),
    nodes: [],
    edges: [],
  };
}

const TOP_LEVEL_FIELDS = new Set(['v', 'nodeTypes', 'edgeTypes', 'nodes', 'edges', 'overview', 'agentGuidance']);
const OVERVIEW_FIELDS = new Set(['requirements']);
const OVERVIEW_REQUIREMENTS_FIELDS = new Set(['rootNodeIds']);
const NODE_TYPE_FIELDS = new Set(['id', 'name', 'color', 'layout', 'agentGuidance']);
const EDGE_TYPE_FIELDS = new Set(['id', 'name', 'color', 'dash', 'arrowHead', 'directed']);
const NODE_FIELDS = new Set(['id', 'tab', 'type', 'name', 'text', 'agentGuidance', 'parent', 'expanded', 'order', 'ports', 'width', 'height', 'x', 'y']);
const PORTS_FIELDS = new Set(['entry', 'exit']);
const PORT_FIELDS = new Set(['side', 'offset']);
const EDGE_FIELDS = new Set(['id', 'tab', 'type', 'from', 'to']);

function unknownFieldIssues(obj: Record<string, unknown>, allowed: Set<string>, path: string): string[] {
  return Object.keys(obj)
    .filter(key => !allowed.has(key))
    .map(key => `${path}: unknown field "${key}"`);
}

function requireString(obj: Record<string, unknown>, field: string, path: string, issues: string[]): boolean {
  if (typeof obj[field] === 'string') return true;
  issues.push(`${path}.${field}: must be a string`);
  return false;
}

function optionalString(obj: Record<string, unknown>, field: string, path: string, issues: string[]): boolean {
  if (obj[field] === undefined || typeof obj[field] === 'string') return true;
  issues.push(`${path}.${field}: must be a string`);
  return false;
}

function requireBoolean(obj: Record<string, unknown>, field: string, path: string, issues: string[]): boolean {
  if (typeof obj[field] === 'boolean') return true;
  issues.push(`${path}.${field}: must be a boolean`);
  return false;
}

function asObject(value: unknown, path: string, what: string, issues: string[]): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: ${what} must be an object`);
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseNodeType(value: unknown, path: string, issues: string[]): MerinoNodeType | undefined {
  const t = asObject(value, path, 'node type', issues);
  if (t === undefined) return undefined;
  issues.push(...unknownFieldIssues(t, NODE_TYPE_FIELDS, path));
  let ok = requireString(t, 'id', path, issues);
  ok = requireString(t, 'name', path, issues) && ok;
  if (!isMerinoColorToken(t['color'])) {
    issues.push(`${path}.color: must be a Merino color token`);
    ok = false;
  }
  if (t['layout'] !== undefined && !isMerinoContainerLayout(t['layout'])) {
    issues.push(`${path}.layout: must be "container" or "list"`);
    ok = false;
  }
  ok = optionalString(t, 'agentGuidance', path, issues) && ok;
  if (!ok) return undefined;
  const type: MerinoNodeType = { id: t['id'] as string, name: t['name'] as string, color: t['color'] as MerinoNodeType['color'] };
  if (isMerinoContainerLayout(t['layout'])) type.layout = t['layout'];
  if (t['agentGuidance'] !== undefined) type.agentGuidance = t['agentGuidance'] as string;
  return type;
}

function parseEdgeType(value: unknown, path: string, issues: string[]): MerinoEdgeType | undefined {
  const t = asObject(value, path, 'edge type', issues);
  if (t === undefined) return undefined;
  issues.push(...unknownFieldIssues(t, EDGE_TYPE_FIELDS, path));
  let ok = requireString(t, 'id', path, issues);
  ok = requireString(t, 'name', path, issues) && ok;
  if (!isMerinoColorToken(t['color'])) {
    issues.push(`${path}.color: must be a Merino color token`);
    ok = false;
  }
  if (!isMerinoDash(t['dash'])) {
    issues.push(`${path}.dash: must be one of solid, dashed, dotted`);
    ok = false;
  }
  ok = requireBoolean(t, 'arrowHead', path, issues) && ok;
  ok = requireBoolean(t, 'directed', path, issues) && ok;
  if (!ok) return undefined;
  return {
    id: t['id'] as string,
    name: t['name'] as string,
    color: t['color'] as MerinoEdgeType['color'],
    dash: t['dash'] as MerinoEdgeType['dash'],
    arrowHead: t['arrowHead'] as boolean,
    directed: t['directed'] as boolean,
  };
}

function parsePortPosition(value: unknown, path: string, issues: string[]): MerinoPortPosition | undefined {
  const p = asObject(value, path, 'port', issues);
  if (p === undefined) return undefined;
  issues.push(...unknownFieldIssues(p, PORT_FIELDS, path));
  let ok = true;
  if (!isMerinoPortSide(p['side'])) {
    issues.push(`${path}.side: must be one of top, right, bottom, left`);
    ok = false;
  }
  if (!(typeof p['offset'] === 'number' && Number.isFinite(p['offset']))) {
    issues.push(`${path}.offset: must be a finite number`);
    ok = false;
  }
  if (!ok) return undefined;
  return { side: p['side'] as MerinoPortPosition['side'], offset: p['offset'] as number };
}

function parsePorts(value: unknown, path: string, issues: string[]): MerinoPorts | undefined {
  const p = asObject(value, path, 'ports', issues);
  if (p === undefined) return undefined;
  issues.push(...unknownFieldIssues(p, PORTS_FIELDS, path));
  const ports: MerinoPorts = {};
  for (const kind of ['entry', 'exit'] as const) {
    if (p[kind] === undefined) continue;
    const pos = parsePortPosition(p[kind], `${path}.${kind}`, issues);
    if (pos !== undefined) ports[kind] = pos;
  }
  return ports;
}

function parseNode(value: unknown, path: string, issues: string[]): MerinoNode | undefined {
  const n = asObject(value, path, 'node', issues);
  if (n === undefined) return undefined;
  issues.push(...unknownFieldIssues(n, NODE_FIELDS, path));
  let ok = requireString(n, 'id', path, issues);
  ok = requireString(n, 'type', path, issues) && ok;
  ok = requireString(n, 'name', path, issues) && ok;
  ok = optionalString(n, 'text', path, issues) && ok;
  ok = optionalString(n, 'agentGuidance', path, issues) && ok;
  ok = optionalString(n, 'parent', path, issues) && ok;
  if (n['expanded'] !== undefined && typeof n['expanded'] !== 'boolean') {
    issues.push(`${path}.expanded: must be a boolean`);
    ok = false;
  }
  if (n['order'] !== undefined && !(typeof n['order'] === 'number' && Number.isFinite(n['order']))) {
    issues.push(`${path}.order: must be a finite number`);
    ok = false;
  }
  if (!isMerinoTab(n['tab'])) {
    issues.push(`${path}.tab: must be "requirements" or "deployments"`);
    ok = false;
  }
  if ((n['x'] !== undefined) !== (n['y'] !== undefined)) {
    issues.push(`${path}: "x" and "y" must appear together`);
    ok = false;
  }
  for (const field of ['width', 'height'] as const) {
    if (n[field] !== undefined && !(typeof n[field] === 'number' && Number.isFinite(n[field]) && n[field] > 0)) {
      issues.push(`${path}.${field}: must be a positive finite number`);
      ok = false;
    }
  }
  for (const field of ['x', 'y'] as const) {
    if (n[field] !== undefined && !(typeof n[field] === 'number' && Number.isFinite(n[field]))) {
      issues.push(`${path}.${field}: must be a finite number`);
      ok = false;
    }
  }
  let ports: MerinoPorts | undefined;
  if (n['ports'] !== undefined) {
    const before = issues.length;
    ports = parsePorts(n['ports'], `${path}.ports`, issues);
    if (issues.length > before) ok = false;
  }
  if (!ok) return undefined;
  const node: MerinoNode = {
    id: n['id'] as string,
    tab: n['tab'] as MerinoNode['tab'],
    type: n['type'] as string,
    name: n['name'] as string,
  };
  if (n['text'] !== undefined) node.text = n['text'] as string;
  if (n['agentGuidance'] !== undefined) node.agentGuidance = n['agentGuidance'] as string;
  if (n['parent'] !== undefined) node.parent = n['parent'] as string;
  if (n['expanded'] !== undefined) node.expanded = n['expanded'] as boolean;
  if (n['order'] !== undefined) node.order = n['order'] as number;
  if (ports !== undefined) node.ports = ports;
  if (n['width'] !== undefined) node.width = n['width'] as number;
  if (n['height'] !== undefined) node.height = n['height'] as number;
  if (n['x'] !== undefined) node.x = n['x'] as number;
  if (n['y'] !== undefined) node.y = n['y'] as number;
  return node;
}

function parseEdge(value: unknown, path: string, issues: string[]): MerinoEdge | undefined {
  const e = asObject(value, path, 'edge', issues);
  if (e === undefined) return undefined;
  issues.push(...unknownFieldIssues(e, EDGE_FIELDS, path));
  let ok = requireString(e, 'id', path, issues);
  ok = requireString(e, 'type', path, issues) && ok;
  ok = requireString(e, 'from', path, issues) && ok;
  ok = requireString(e, 'to', path, issues) && ok;
  if (!isMerinoTab(e['tab'])) {
    issues.push(`${path}.tab: must be "requirements" or "deployments"`);
    ok = false;
  }
  if (!ok) return undefined;
  return {
    id: e['id'] as string,
    tab: e['tab'] as MerinoEdge['tab'],
    type: e['type'] as string,
    from: e['from'] as string,
    to: e['to'] as string,
  };
}

/** Walk each node's parent chain; report a cycle's member ids in the issue text. */
function parentCycleIssues(nodes: MerinoNode[]): string[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const issues: string[] = [];
  const reported = new Set<string>();
  for (const node of nodes) {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current: MerinoNode | undefined = node;
    while (current) {
      if (visited.has(current.id)) {
        const cycleStart = chain.indexOf(current.id);
        const cycle = chain.slice(cycleStart);
        if (!cycle.some(id => reported.has(id))) {
          for (const id of cycle) reported.add(id);
          issues.push(`node parent cycle: ${cycle.join(' -> ')} -> ${current.id}`);
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

export function parseMerinoDocument(text: string): ParseMerinoDocumentResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [`invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, issues: ['document must be a non-null, non-array JSON object'] };
  }

  const obj = migrateMerinoDocument(parsed as Record<string, unknown>);
  const issues: string[] = unknownFieldIssues(obj, TOP_LEVEL_FIELDS, '');
  optionalString(obj, 'agentGuidance', '', issues);

  if (typeof obj['v'] !== 'number') {
    issues.push('v: must be a number');
  } else if (obj['v'] !== MERINO_CURRENT_VERSION) {
    issues.push(`v: unsupported version ${obj['v']} (current is ${MERINO_CURRENT_VERSION})`);
  }

  const nodeTypes: MerinoNodeType[] = [];
  const nodeTypeIds = new Set<string>();
  if (!Array.isArray(obj['nodeTypes'])) {
    issues.push('nodeTypes: must be an array');
  } else {
    (obj['nodeTypes'] as unknown[]).forEach((value, i) => {
      const t = parseNodeType(value, `nodeTypes[${i}]`, issues);
      if (t === undefined) return;
      if (nodeTypeIds.has(t.id)) issues.push(`nodeTypes[${i}].id: duplicate node type id "${t.id}"`);
      nodeTypeIds.add(t.id);
      nodeTypes.push(t);
    });
  }

  const edgeTypes: MerinoEdgeType[] = [];
  const edgeTypeIds = new Set<string>();
  if (!Array.isArray(obj['edgeTypes'])) {
    issues.push('edgeTypes: must be an array');
  } else {
    (obj['edgeTypes'] as unknown[]).forEach((value, i) => {
      const t = parseEdgeType(value, `edgeTypes[${i}]`, issues);
      if (t === undefined) return;
      if (edgeTypeIds.has(t.id)) issues.push(`edgeTypes[${i}].id: duplicate edge type id "${t.id}"`);
      edgeTypeIds.add(t.id);
      edgeTypes.push(t);
    });
  }

  const nodes: MerinoNode[] = [];
  const nodeIds = new Set<string>();
  if (!Array.isArray(obj['nodes'])) {
    issues.push('nodes: must be an array');
  } else {
    (obj['nodes'] as unknown[]).forEach((value, i) => {
      const node = parseNode(value, `nodes[${i}]`, issues);
      if (node === undefined) return;
      if (nodeIds.has(node.id)) issues.push(`nodes[${i}].id: duplicate node id "${node.id}"`);
      nodeIds.add(node.id);
      if (!nodeTypeIds.has(node.type)) {
        issues.push(`nodes[${i}].type: references unknown node type "${node.type}"`);
      }
      nodes.push(node);
    });
  }
  nodes.forEach((node, i) => {
    if (node.parent !== undefined && !nodeIds.has(node.parent)) {
      issues.push(`nodes[${i}].parent: references unknown node id "${node.parent}"`);
    }
  });
  issues.push(...parentCycleIssues(nodes));

  let overview: MerinoOverviewConfig | undefined;
  if (obj['overview'] !== undefined) {
    const overviewObject = asObject(obj['overview'], 'overview', 'overview', issues);
    if (overviewObject !== undefined) {
      issues.push(...unknownFieldIssues(overviewObject, OVERVIEW_FIELDS, 'overview'));
      overview = {};
      if (overviewObject['requirements'] !== undefined) {
        const requirements = asObject(overviewObject['requirements'], 'overview.requirements', 'requirements overview', issues);
        if (requirements !== undefined) {
          issues.push(...unknownFieldIssues(requirements, OVERVIEW_REQUIREMENTS_FIELDS, 'overview.requirements'));
          const rawIds = requirements['rootNodeIds'];
          if (!Array.isArray(rawIds)) {
            issues.push('overview.requirements.rootNodeIds: must be an array');
          } else {
            const rootNodeIds: string[] = [];
            const seen = new Set<string>();
            rawIds.forEach((value, index) => {
              if (typeof value !== 'string') {
                issues.push(`overview.requirements.rootNodeIds[${index}]: must be a string`);
                return;
              }
              if (seen.has(value)) {
                issues.push(`overview.requirements.rootNodeIds[${index}]: duplicate node id "${value}"`);
                return;
              }
              seen.add(value);
              const node = nodes.find((candidate) => candidate.id === value);
              if (!node) issues.push(`overview.requirements.rootNodeIds[${index}]: references unknown node id "${value}"`);
              else if (node.tab !== 'requirements') issues.push(`overview.requirements.rootNodeIds[${index}]: node "${value}" is not on the requirements Tab`);
              rootNodeIds.push(value);
            });
            overview.requirements = { rootNodeIds };
          }
        }
      }
    }
  }

  const edges: MerinoEdge[] = [];
  const edgeIds = new Set<string>();
  if (!Array.isArray(obj['edges'])) {
    issues.push('edges: must be an array');
  } else {
    (obj['edges'] as unknown[]).forEach((value, i) => {
      const edge = parseEdge(value, `edges[${i}]`, issues);
      if (edge === undefined) return;
      if (edgeIds.has(edge.id)) issues.push(`edges[${i}].id: duplicate edge id "${edge.id}"`);
      edgeIds.add(edge.id);
      if (!edgeTypeIds.has(edge.type)) {
        issues.push(`edges[${i}].type: references unknown edge type "${edge.type}"`);
      }
      if (!nodeIds.has(edge.from)) issues.push(`edges[${i}].from: references unknown node id "${edge.from}"`);
      if (!nodeIds.has(edge.to)) issues.push(`edges[${i}].to: references unknown node id "${edge.to}"`);
      edges.push(edge);
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const doc: MerinoDocument = { v: obj['v'] as number, nodeTypes, edgeTypes, nodes, edges };
  if (overview !== undefined) doc.overview = overview;
  if (obj['agentGuidance'] !== undefined) doc.agentGuidance = obj['agentGuidance'] as string;
  return { ok: true, doc };
}

function serializeNodeType(t: MerinoNodeType): Record<string, unknown> {
  const out: Record<string, unknown> = { id: t.id, name: t.name, color: t.color };
  if (t.layout !== undefined) out['layout'] = t.layout;
  if (t.agentGuidance !== undefined) out['agentGuidance'] = t.agentGuidance;
  return out;
}

function serializeEdgeType(t: MerinoEdgeType): Record<string, unknown> {
  return { id: t.id, name: t.name, color: t.color, dash: t.dash, arrowHead: t.arrowHead, directed: t.directed };
}

function serializePorts(ports: MerinoPorts): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (ports.entry !== undefined) out['entry'] = { side: ports.entry.side, offset: ports.entry.offset };
  if (ports.exit !== undefined) out['exit'] = { side: ports.exit.side, offset: ports.exit.offset };
  return out;
}

function serializeNode(n: MerinoNode): Record<string, unknown> {
  const out: Record<string, unknown> = { id: n.id, tab: n.tab, type: n.type, name: n.name };
  if (n.text !== undefined) out['text'] = n.text;
  if (n.agentGuidance !== undefined) out['agentGuidance'] = n.agentGuidance;
  if (n.parent !== undefined) out['parent'] = n.parent;
  if (n.expanded !== undefined) out['expanded'] = n.expanded;
  if (n.order !== undefined) out['order'] = n.order;
  if (n.ports !== undefined) out['ports'] = serializePorts(n.ports);
  if (n.width !== undefined) out['width'] = n.width;
  if (n.height !== undefined) out['height'] = n.height;
  if (n.x !== undefined) out['x'] = n.x;
  if (n.y !== undefined) out['y'] = n.y;
  return out;
}

function serializeEdge(e: MerinoEdge): Record<string, unknown> {
  return { id: e.id, tab: e.tab, type: e.type, from: e.from, to: e.to };
}

export function serializeMerinoDocument(doc: MerinoDocument): string {
  const out: Record<string, unknown> = {
    v: doc.v,
    nodeTypes: doc.nodeTypes.map(serializeNodeType),
    edgeTypes: doc.edgeTypes.map(serializeEdgeType),
    nodes: doc.nodes.map(serializeNode),
    edges: doc.edges.map(serializeEdge),
  };
  if (doc.agentGuidance !== undefined) out.agentGuidance = doc.agentGuidance;
  if (doc.overview !== undefined) {
    const overview: Record<string, unknown> = {};
    if (doc.overview.requirements !== undefined) {
      overview.requirements = { rootNodeIds: [...doc.overview.requirements.rootNodeIds] };
    }
    out.overview = overview;
  }
  return JSON.stringify(out, null, 2) + '\n';
}
