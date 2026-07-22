import type { AtlasContent, AtlasContentMode } from './types.ts';

export interface AtlasDataSource {
  path: string;
  lines?: [number, number];
  rev?: string;
}

export interface AtlasDataEntry {
  text: string;
  source?: AtlasDataSource;
}

export interface AtlasData {
  v: number;
  of?: string;
  generatedAt?: string;
  entries: Record<string, AtlasDataEntry>;
}

export type ParseAtlasDataResult =
  | { ok: true; data: AtlasData }
  | { ok: false; issues: string[] };

export interface ResolvedContent {
  text: string;
  mode: AtlasContentMode;
  filled: boolean;
  key?: string;
  source?: AtlasDataSource;
  missingKey: boolean;
}

const TOP_LEVEL_FIELDS = new Set(['v', 'of', 'generatedAt', 'entries']);
const ENTRY_FIELDS = new Set(['text', 'source']);
const SOURCE_FIELDS = new Set(['path', 'lines', 'rev']);

function unknownFieldIssues(obj: Record<string, unknown>, allowed: Set<string>, path: string): string[] {
  return Object.keys(obj)
    .filter(key => !allowed.has(key))
    .map(key => `${path}: unknown field "${key}"`);
}

function parseSource(value: unknown, path: string, issues: string[]): AtlasDataSource | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: "source" must be an object`);
    return undefined;
  }
  const s = value as Record<string, unknown>;
  issues.push(...unknownFieldIssues(s, SOURCE_FIELDS, path));
  let ok = true;
  if (typeof s['path'] !== 'string') {
    issues.push(`${path}.path: must be a string`);
    ok = false;
  }
  if (s['lines'] !== undefined) {
    const lines = s['lines'];
    if (
      !Array.isArray(lines) ||
      lines.length !== 2 ||
      typeof lines[0] !== 'number' ||
      typeof lines[1] !== 'number'
    ) {
      issues.push(`${path}.lines: must be a tuple of two numbers`);
      ok = false;
    }
  }
  if (s['rev'] !== undefined && typeof s['rev'] !== 'string') {
    issues.push(`${path}.rev: must be a string`);
    ok = false;
  }
  if (!ok) return undefined;
  const source: AtlasDataSource = { path: s['path'] as string };
  if (s['lines'] !== undefined) source.lines = s['lines'] as [number, number];
  if (s['rev'] !== undefined) source.rev = s['rev'] as string;
  return source;
}

function parseEntry(value: unknown, path: string, issues: string[]): AtlasDataEntry | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${path}: entry must be an object`);
    return undefined;
  }
  const e = value as Record<string, unknown>;
  issues.push(...unknownFieldIssues(e, ENTRY_FIELDS, path));
  let ok = true;
  if (typeof e['text'] !== 'string') {
    issues.push(`${path}.text: must be a string`);
    ok = false;
  }
  let source: AtlasDataSource | undefined;
  if (e['source'] !== undefined) {
    source = parseSource(e['source'], `${path}.source`, issues);
    if (source === undefined) ok = false;
  }
  if (!ok) return undefined;
  const entry: AtlasDataEntry = { text: e['text'] as string };
  if (source !== undefined) entry.source = source;
  return entry;
}

export function emptyAtlasData(): AtlasData {
  return { v: 1, entries: {} };
}

export function parseAtlasData(text: string): ParseAtlasDataResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, issues: [`invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, issues: ['data file must be a non-null, non-array JSON object'] };
  }

  const obj = parsed as Record<string, unknown>;
  const issues: string[] = unknownFieldIssues(obj, TOP_LEVEL_FIELDS, '');

  if (typeof obj['v'] !== 'number') {
    issues.push('v: must be a number');
  }
  if (obj['of'] !== undefined && typeof obj['of'] !== 'string') {
    issues.push('of: must be a string');
  }
  if (obj['generatedAt'] !== undefined && typeof obj['generatedAt'] !== 'string') {
    issues.push('generatedAt: must be a string');
  }

  const entries: Record<string, AtlasDataEntry> = {};
  if (obj['entries'] === null || typeof obj['entries'] !== 'object' || Array.isArray(obj['entries'])) {
    issues.push('entries: must be an object');
  } else {
    for (const [key, value] of Object.entries(obj['entries'] as Record<string, unknown>)) {
      const entry = parseEntry(value, `entries.${key}`, issues);
      if (entry !== undefined) entries[key] = entry;
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const data: AtlasData = { v: obj['v'] as number, entries };
  if (obj['of'] !== undefined) data.of = obj['of'] as string;
  if (obj['generatedAt'] !== undefined) data.generatedAt = obj['generatedAt'] as string;
  return { ok: true, data };
}

export function resolveContent(
  content: AtlasContent | undefined,
  data: AtlasData | undefined,
): ResolvedContent | undefined {
  if (content === undefined) return undefined;

  if (content.from === undefined) {
    return { text: content.text, mode: content.mode, filled: false, missingKey: false };
  }

  const entry = data?.entries[content.from];
  if (entry === undefined) {
    return {
      text: content.text,
      mode: content.mode,
      filled: false,
      missingKey: true,
      key: content.from,
    };
  }

  return {
    text: entry.text,
    mode: content.mode,
    filled: true,
    missingKey: false,
    key: content.from,
    source: entry.source,
  };
}
