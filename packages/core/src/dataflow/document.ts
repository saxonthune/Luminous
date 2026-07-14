import type { ContractBlock, DataflowBox, DataflowDocument, DataflowFlow } from './types.ts';

export type ParseDataflowDocumentResult =
  | { ok: true; doc: DataflowDocument }
  | { ok: false; issues: string[] };

export function emptyDataflowDocument(): DataflowDocument {
  return { v: 1, boxes: [], flows: [] };
}

const TOP_LEVEL_FIELDS = new Set(['v', 'boxes', 'flows']);
const BOX_FIELDS = new Set(['id', 'name', 'description', 'contract']);
const CONTRACT_FIELDS = new Set(['format', 'text']);
const FLOW_FIELDS = new Set(['from', 'to']);

function unknownFieldIssues(obj: Record<string, unknown>, allowed: Set<string>, path: string): string[] {
  return Object.keys(obj)
    .filter(key => !allowed.has(key))
    .map(key => `${path}: unknown field "${key}"`);
}

function parseContract(value: unknown, path: string, issues: string[]): ContractBlock | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: "contract" must be an object`);
    return undefined;
  }
  const c = value as Record<string, unknown>;
  issues.push(...unknownFieldIssues(c, CONTRACT_FIELDS, path));
  let ok = true;
  if (typeof c['format'] !== 'string') {
    issues.push(`${path}.format: must be a string`);
    ok = false;
  }
  if (typeof c['text'] !== 'string') {
    issues.push(`${path}.text: must be a string`);
    ok = false;
  }
  if (!ok) return undefined;
  return { format: c['format'] as string, text: c['text'] as string };
}

function parseBox(value: unknown, path: string, issues: string[]): DataflowBox | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: box must be an object`);
    return undefined;
  }
  const b = value as Record<string, unknown>;
  issues.push(...unknownFieldIssues(b, BOX_FIELDS, path));
  let ok = true;
  if (typeof b['id'] !== 'string') {
    issues.push(`${path}.id: must be a string`);
    ok = false;
  }
  if (typeof b['name'] !== 'string') {
    issues.push(`${path}.name: must be a string`);
    ok = false;
  }
  if (b['description'] !== undefined && typeof b['description'] !== 'string') {
    issues.push(`${path}.description: must be a string`);
    ok = false;
  }
  let contract: ContractBlock | undefined;
  if (b['contract'] !== undefined) {
    contract = parseContract(b['contract'], `${path}.contract`, issues);
    if (contract === undefined) ok = false;
  }
  if (!ok) return undefined;
  const box: DataflowBox = { id: b['id'] as string, name: b['name'] as string };
  if (b['description'] !== undefined) box.description = b['description'] as string;
  if (contract !== undefined) box.contract = contract;
  return box;
}

function parseFlow(value: unknown, path: string, issues: string[]): DataflowFlow | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: flow must be an object`);
    return undefined;
  }
  const f = value as Record<string, unknown>;
  issues.push(...unknownFieldIssues(f, FLOW_FIELDS, path));
  let ok = true;
  if (typeof f['from'] !== 'string') {
    issues.push(`${path}.from: must be a string`);
    ok = false;
  }
  if (typeof f['to'] !== 'string') {
    issues.push(`${path}.to: must be a string`);
    ok = false;
  }
  if (!ok) return undefined;
  return { from: f['from'] as string, to: f['to'] as string };
}

export function parseDataflowDocument(text: string): ParseDataflowDocumentResult {
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

  const boxes: DataflowBox[] = [];
  if (!Array.isArray(obj['boxes'])) {
    issues.push('boxes: must be an array');
  } else {
    const seenIds = new Set<string>();
    (obj['boxes'] as unknown[]).forEach((value, i) => {
      const box = parseBox(value, `boxes[${i}]`, issues);
      if (box === undefined) return;
      if (seenIds.has(box.id)) {
        issues.push(`boxes[${i}].id: duplicate box id "${box.id}"`);
      }
      seenIds.add(box.id);
      boxes.push(box);
    });
  }

  const flows: DataflowFlow[] = [];
  if (!Array.isArray(obj['flows'])) {
    issues.push('flows: must be an array');
  } else {
    const boxIds = new Set(boxes.map(b => b.id));
    (obj['flows'] as unknown[]).forEach((value, i) => {
      const flow = parseFlow(value, `flows[${i}]`, issues);
      if (flow === undefined) return;
      if (!boxIds.has(flow.from)) {
        issues.push(`flows[${i}].from: references unknown box id "${flow.from}"`);
      }
      if (!boxIds.has(flow.to)) {
        issues.push(`flows[${i}].to: references unknown box id "${flow.to}"`);
      }
      flows.push(flow);
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, doc: { v: obj['v'] as number, boxes, flows } };
}

function serializeContract(contract: ContractBlock): Record<string, unknown> {
  return { format: contract.format, text: contract.text };
}

function serializeBox(box: DataflowBox): Record<string, unknown> {
  const out: Record<string, unknown> = { id: box.id, name: box.name };
  if (box.description !== undefined) out['description'] = box.description;
  if (box.contract !== undefined) out['contract'] = serializeContract(box.contract);
  return out;
}

function serializeFlow(flow: DataflowFlow): Record<string, unknown> {
  return { from: flow.from, to: flow.to };
}

export function serializeDataflowDocument(doc: DataflowDocument): string {
  const out = {
    v: doc.v,
    boxes: doc.boxes.map(serializeBox),
    flows: doc.flows.map(serializeFlow),
  };
  return JSON.stringify(out, null, 2) + '\n';
}
