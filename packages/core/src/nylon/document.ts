import type { NylonArc, NylonContract, NylonDocument, NylonTransformation } from './types.ts';

export type ParseNylonDocumentResult =
  | { ok: true; doc: NylonDocument }
  | { ok: false; issues: string[] };

export function emptyNylonDocument(): NylonDocument {
  return { v: 1, transformations: [], contracts: [], arcs: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function optionalStringList(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isContractPair(value: unknown): boolean {
  return isRecord(value)
    && typeof value.input === 'string'
    && typeof value.output === 'string';
}

function optionalContractPair(value: unknown): boolean {
  return value === undefined || isContractPair(value);
}

function isTransformation(value: unknown): value is NylonTransformation {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && optionalString(value.prose)
    && optionalStringList(value.needs)
    && optionalContractPair(value.contractPair)
    && optionalString(value.parent)
    && optionalNumber(value.x)
    && optionalNumber(value.y);
}

function isContract(value: unknown): value is NylonContract {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && optionalString(value.kind)
    && optionalString(value.text)
    && optionalString(value.parent)
    && optionalNumber(value.x)
    && optionalNumber(value.y);
}

function isArc(value: unknown): value is NylonArc {
  return isRecord(value) && typeof value.from === 'string' && typeof value.to === 'string'
    && optionalString(value.id)
    && optionalString(value.invocation)
    && (value.kind === undefined || value.kind === 'data' || value.kind === 'control')
    && (value.control === undefined || ['invoke', 'return', 'continue'].includes(value.control as string))
    && optionalContractPair(value.controlContract);
}

export function parseNylonDocument(text: string): ParseNylonDocumentResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [error instanceof Error ? error.message : 'invalid JSON'] };
  }
  if (!isRecord(raw)) return { ok: false, issues: ['document must be an object'] };

  const issues: string[] = [];
  if (raw.v !== 1) issues.push('v must be 1');
  if (!optionalString(raw.title)) issues.push('title must be a string');
  if (!Array.isArray(raw.transformations) || !raw.transformations.every(isTransformation)) {
    issues.push('transformations must contain valid Transformation objects');
  }
  if (!Array.isArray(raw.contracts) || !raw.contracts.every(isContract)) {
    issues.push('contracts must contain valid Contract objects');
  }
  if (!Array.isArray(raw.arcs) || !raw.arcs.every(isArc)) {
    issues.push('arcs must contain valid Arc objects');
  }
  if (issues.length > 0) return { ok: false, issues };

  const doc: NylonDocument = {
    v: 1,
    transformations: raw.transformations as NylonTransformation[],
    contracts: raw.contracts as NylonContract[],
    arcs: raw.arcs as NylonArc[],
  };
  if (typeof raw.title === 'string') doc.title = raw.title;
  return { ok: true, doc };
}

export function serializeNylonDocument(doc: NylonDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
