import { TRACE_NODE_KINDS, isTraceNodeKind } from './kind-descriptors.ts';
import { LINEN_CURRENT_VERSION, migrateLinenDocument } from './migrate.ts';
import type { LinenContract, LinenDocument, LinenEdge, LinenModule, LinenTraceNode } from './types.ts';

export type ParseLinenDocumentResult =
  | { ok: true; doc: LinenDocument }
  | { ok: false; issues: string[] };

export function emptyLinenDocument(): LinenDocument {
  return { v: LINEN_CURRENT_VERSION, modules: [], contracts: [], nodes: [], edges: [] };
}

const TOP_LEVEL_FIELDS = new Set(['v', 'modules', 'contracts', 'nodes', 'edges']);
const MODULE_FIELDS = new Set(['id', 'name', 'parent']);
const CONTRACT_FIELDS = new Set(['id', 'name', 'owner', 'text']);
const NODE_FIELDS = new Set(['id', 'kind', 'module', 'annotation', 'x', 'y', 'to', 'contract']);
const EDGE_FIELDS = new Set(['from', 'to']);

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

function asObject(value: unknown, path: string, what: string, issues: string[]): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: ${what} must be an object`);
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseModule(value: unknown, path: string, issues: string[]): LinenModule | undefined {
  const m = asObject(value, path, 'module', issues);
  if (m === undefined) return undefined;
  issues.push(...unknownFieldIssues(m, MODULE_FIELDS, path));
  let ok = requireString(m, 'id', path, issues);
  ok = requireString(m, 'name', path, issues) && ok;
  ok = optionalString(m, 'parent', path, issues) && ok;
  if (!ok) return undefined;
  const module: LinenModule = { id: m['id'] as string, name: m['name'] as string };
  if (m['parent'] !== undefined) module.parent = m['parent'] as string;
  return module;
}

function parseContract(value: unknown, path: string, issues: string[]): LinenContract | undefined {
  const c = asObject(value, path, 'contract', issues);
  if (c === undefined) return undefined;
  issues.push(...unknownFieldIssues(c, CONTRACT_FIELDS, path));
  let ok = requireString(c, 'id', path, issues);
  ok = requireString(c, 'name', path, issues) && ok;
  ok = optionalString(c, 'owner', path, issues) && ok;
  ok = optionalString(c, 'text', path, issues) && ok;
  if (!ok) return undefined;
  const contract: LinenContract = { id: c['id'] as string, name: c['name'] as string };
  if (c['owner'] !== undefined) contract.owner = c['owner'] as string;
  if (c['text'] !== undefined) contract.text = c['text'] as string;
  return contract;
}

function parseNode(value: unknown, path: string, issues: string[]): LinenTraceNode | undefined {
  const n = asObject(value, path, 'node', issues);
  if (n === undefined) return undefined;
  issues.push(...unknownFieldIssues(n, NODE_FIELDS, path));
  let ok = requireString(n, 'id', path, issues);
  ok = requireString(n, 'module', path, issues) && ok;
  ok = optionalString(n, 'annotation', path, issues) && ok;
  if (!isTraceNodeKind(n['kind'])) {
    issues.push(`${path}.kind: must be one of ${TRACE_NODE_KINDS.join(', ')}`);
    ok = false;
  }
  if ((n['x'] !== undefined) !== (n['y'] !== undefined)) {
    issues.push(`${path}: "x" and "y" must appear together`);
    ok = false;
  }
  for (const field of ['x', 'y'] as const) {
    if (n[field] !== undefined && !(typeof n[field] === 'number' && Number.isFinite(n[field]))) {
      issues.push(`${path}.${field}: must be a finite number`);
      ok = false;
    }
  }
  if (n['kind'] === 'pass') {
    ok = requireString(n, 'to', path, issues) && ok;
  } else if (n['to'] !== undefined) {
    issues.push(`${path}.to: only a Pass names a Module passed to`);
    ok = false;
  }
  if (n['kind'] === 'type') {
    ok = optionalString(n, 'contract', path, issues) && ok;
  } else if (n['contract'] !== undefined) {
    issues.push(`${path}.contract: only a Type names a Contract`);
    ok = false;
  }
  if (!ok) return undefined;
  const node = { id: n['id'], kind: n['kind'], module: n['module'] } as LinenTraceNode;
  if (n['annotation'] !== undefined) node.annotation = n['annotation'] as string;
  if (n['x'] !== undefined) node.x = n['x'] as number;
  if (n['y'] !== undefined) node.y = n['y'] as number;
  if (node.kind === 'pass') node.to = n['to'] as string;
  if (node.kind === 'type' && n['contract'] !== undefined) node.contract = n['contract'] as string;
  return node;
}

function parseEdge(value: unknown, path: string, issues: string[]): LinenEdge | undefined {
  const e = asObject(value, path, 'edge', issues);
  if (e === undefined) return undefined;
  issues.push(...unknownFieldIssues(e, EDGE_FIELDS, path));
  let ok = requireString(e, 'from', path, issues);
  ok = requireString(e, 'to', path, issues) && ok;
  if (!ok) return undefined;
  return { from: e['from'] as string, to: e['to'] as string };
}

/** Walk each module's parent chain; report a cycle's member ids in the issue text. */
function parentCycleIssues(modules: LinenModule[]): string[] {
  const byId = new Map(modules.map(m => [m.id, m]));
  const issues: string[] = [];
  const reported = new Set<string>();
  for (const module of modules) {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current: LinenModule | undefined = module;
    while (current) {
      if (visited.has(current.id)) {
        const cycleStart = chain.indexOf(current.id);
        const cycle = chain.slice(cycleStart);
        if (!cycle.some(id => reported.has(id))) {
          for (const id of cycle) reported.add(id);
          issues.push(`module parent cycle: ${cycle.join(' -> ')} -> ${current.id}`);
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

export function parseLinenDocument(text: string): ParseLinenDocumentResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [`invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, issues: ['document must be a non-null, non-array JSON object'] };
  }

  const obj = migrateLinenDocument(parsed as Record<string, unknown>);
  const issues: string[] = unknownFieldIssues(obj, TOP_LEVEL_FIELDS, '');

  if (typeof obj['v'] !== 'number') {
    issues.push('v: must be a number');
  } else if (obj['v'] !== LINEN_CURRENT_VERSION) {
    issues.push(`v: unsupported version ${obj['v']} (current is ${LINEN_CURRENT_VERSION})`);
  }

  const seenIds = new Set<string>();
  function checkUniqueId(id: string, path: string): void {
    if (seenIds.has(id)) {
      issues.push(`${path}.id: duplicate id "${id}" (ids are unique across modules, contracts, and nodes)`);
    }
    seenIds.add(id);
  }

  const modules: LinenModule[] = [];
  if (!Array.isArray(obj['modules'])) {
    issues.push('modules: must be an array');
  } else {
    (obj['modules'] as unknown[]).forEach((value, i) => {
      const module = parseModule(value, `modules[${i}]`, issues);
      if (module === undefined) return;
      checkUniqueId(module.id, `modules[${i}]`);
      modules.push(module);
    });
  }
  const moduleIds = new Set(modules.map(m => m.id));
  modules.forEach((module, i) => {
    if (module.parent !== undefined && !moduleIds.has(module.parent)) {
      issues.push(`modules[${i}].parent: references unknown module id "${module.parent}"`);
    }
  });
  issues.push(...parentCycleIssues(modules));

  const contracts: LinenContract[] = [];
  if (!Array.isArray(obj['contracts'])) {
    issues.push('contracts: must be an array');
  } else {
    (obj['contracts'] as unknown[]).forEach((value, i) => {
      const contract = parseContract(value, `contracts[${i}]`, issues);
      if (contract === undefined) return;
      checkUniqueId(contract.id, `contracts[${i}]`);
      if (contract.owner !== undefined && !moduleIds.has(contract.owner)) {
        issues.push(`contracts[${i}].owner: references unknown module id "${contract.owner}"`);
      }
      contracts.push(contract);
    });
  }
  const contractIds = new Set(contracts.map(c => c.id));

  const nodes: LinenTraceNode[] = [];
  if (!Array.isArray(obj['nodes'])) {
    issues.push('nodes: must be an array');
  } else {
    (obj['nodes'] as unknown[]).forEach((value, i) => {
      const node = parseNode(value, `nodes[${i}]`, issues);
      if (node === undefined) return;
      checkUniqueId(node.id, `nodes[${i}]`);
      if (!moduleIds.has(node.module)) {
        issues.push(`nodes[${i}].module: references unknown module id "${node.module}"`);
      }
      if (node.kind === 'pass' && !moduleIds.has(node.to)) {
        issues.push(`nodes[${i}].to: references unknown module id "${node.to}"`);
      }
      if (node.kind === 'type' && node.contract !== undefined && !contractIds.has(node.contract)) {
        issues.push(`nodes[${i}].contract: references unknown contract id "${node.contract}"`);
      }
      nodes.push(node);
    });
  }

  const edges: LinenEdge[] = [];
  if (!Array.isArray(obj['edges'])) {
    issues.push('edges: must be an array');
  } else {
    (obj['edges'] as unknown[]).forEach((value, i) => {
      const edge = parseEdge(value, `edges[${i}]`, issues);
      if (edge === undefined) return;
      if (!seenIds.has(edge.from)) {
        issues.push(`edges[${i}].from: references unknown id "${edge.from}"`);
      }
      if (!seenIds.has(edge.to)) {
        issues.push(`edges[${i}].to: references unknown id "${edge.to}"`);
      }
      edges.push(edge);
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, doc: { v: obj['v'] as number, modules, contracts, nodes, edges } };
}

function serializeModule(module: LinenModule): Record<string, unknown> {
  const out: Record<string, unknown> = { id: module.id, name: module.name };
  if (module.parent !== undefined) out['parent'] = module.parent;
  return out;
}

function serializeContract(contract: LinenContract): Record<string, unknown> {
  const out: Record<string, unknown> = { id: contract.id, name: contract.name };
  if (contract.owner !== undefined) out['owner'] = contract.owner;
  if (contract.text !== undefined) out['text'] = contract.text;
  return out;
}

function serializeNode(node: LinenTraceNode): Record<string, unknown> {
  const out: Record<string, unknown> = { id: node.id, kind: node.kind, module: node.module };
  if (node.kind === 'pass') out['to'] = node.to;
  if (node.kind === 'type' && node.contract !== undefined) out['contract'] = node.contract;
  if (node.annotation !== undefined) out['annotation'] = node.annotation;
  if (node.x !== undefined) out['x'] = node.x;
  if (node.y !== undefined) out['y'] = node.y;
  return out;
}

export function serializeLinenDocument(doc: LinenDocument): string {
  const out: Record<string, unknown> = {
    v: doc.v,
    modules: doc.modules.map(serializeModule),
    contracts: doc.contracts.map(serializeContract),
    nodes: doc.nodes.map(serializeNode),
    edges: doc.edges.map(e => ({ from: e.from, to: e.to })),
  };
  return JSON.stringify(out, null, 2) + '\n';
}
