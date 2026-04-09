#!/usr/bin/env tsx
/**
 * Extract the public API from @luminous/cactus and generate:
 *   1. A canvas file (.canvases/cactus-api.canvas.json) with spatial grouping
 *   2. Markdown reference (stdout, or file path as first arg)
 *
 * Usage: npx tsx scripts/extract-cactus-api.ts [output.md]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CACTUS_SRC = resolve(ROOT, 'packages/cactus/src');
const INDEX_PATH = resolve(CACTUS_SRC, 'index.ts');
const CANVAS_OUT = resolve(ROOT, '.canvases/cactus-api.canvas.json');

// ---------------------------------------------------------------------------
// Phase 1: Parse export manifest from index.ts
// ---------------------------------------------------------------------------

interface ExportEntry {
  name: string;
  sourceFile: string; // resolved absolute path
  typeOnly: boolean;
}

function parseExportManifest(): ExportEntry[] {
  const src = readFileSync(INDEX_PATH, 'utf-8');
  const entries: ExportEntry[] = [];

  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('export')) continue;

    // Match: export { Foo, type Bar } from './file.js'
    // or:    export type { Foo } from './file.js'
    const m = trimmed.match(
      /^export\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/
    );
    if (!m) continue;

    const allTypeOnly = !!m[1]; // export type { ... }
    const namesRaw = m[2];
    const fromPath = m[3];

    // Resolve .js -> .ts/.tsx
    const resolved = resolveSourceFile(fromPath);
    if (!resolved) continue;

    // Parse individual names (handle inline `type` keyword)
    for (const part of namesRaw.split(',')) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const typeMatch = cleaned.match(/^type\s+(\w+)/);
      if (typeMatch) {
        entries.push({ name: typeMatch[1], sourceFile: resolved, typeOnly: true });
      } else {
        const nameMatch = cleaned.match(/^(\w+)/);
        if (nameMatch) {
          entries.push({ name: nameMatch[1], sourceFile: resolved, typeOnly: allTypeOnly });
        }
      }
    }
  }

  return entries;
}

function resolveSourceFile(fromPath: string): string | null {
  const base = resolve(CACTUS_SRC, fromPath);
  // Try .ts, .tsx, then exact
  for (const ext of ['.ts', '.tsx']) {
    const candidate = base.replace(/\.js$/, ext);
    if (existsSync(candidate)) return candidate;
  }
  if (existsSync(base)) return base;
  return null;
}

// ---------------------------------------------------------------------------
// Phase 2: Extract signatures from source files
// ---------------------------------------------------------------------------

interface ApiItem {
  name: string;
  kind: 'function' | 'component' | 'interface' | 'type' | 'const';
  signature: string;
  sourceFile: string; // relative to cactus/src
  typeOnly: boolean;
}

function extractSignatures(entries: ExportEntry[]): ApiItem[] {
  const fileCache = new Map<string, string>();
  const items: ApiItem[] = [];

  function readCached(path: string): string {
    if (!fileCache.has(path)) {
      fileCache.set(path, readFileSync(path, 'utf-8'));
    }
    return fileCache.get(path)!;
  }

  for (const entry of entries) {
    const src = readCached(entry.sourceFile);
    const relPath = entry.sourceFile.replace(CACTUS_SRC + '/', '');

    // Check for re-exports (e.g. containment.ts re-exports from geometry.ts)
    const reExportMatch = src.match(
      new RegExp(`export\\s+(?:type\\s+)?\\{[^}]*\\b${entry.name}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`)
    );

    let effectiveSrc = src;
    let effectivePath = relPath;
    if (reExportMatch) {
      const resolved = resolveSourceFile(reExportMatch[1]);
      if (resolved) {
        // Check if the definition is actually in the re-export source
        const reExportSrc = readCached(resolved);
        if (hasDefinition(reExportSrc, entry.name)) {
          effectiveSrc = reExportSrc;
          effectivePath = resolved.replace(CACTUS_SRC + '/', '');
        }
      }
    }

    const item = extractItem(entry.name, effectiveSrc, effectivePath, entry.typeOnly);
    if (item) items.push(item);
  }

  return items;
}

function hasDefinition(src: string, name: string): boolean {
  return new RegExp(`(?:export\\s+(?:function|interface|type|const)\\s+${name}\\b)`).test(src);
}

function extractItem(
  name: string,
  src: string,
  relPath: string,
  typeOnly: boolean
): ApiItem | null {
  // Interface
  const ifaceMatch = src.match(new RegExp(`export\\s+interface\\s+${name}\\s*\\{`));
  if (ifaceMatch) {
    const start = ifaceMatch.index!;
    const body = extractBraceBlock(src, start + ifaceMatch[0].length - 1);
    const signature = `export interface ${name} ${body}`;
    return { name, kind: 'interface', signature, sourceFile: relPath, typeOnly };
  }

  // Type alias
  const typeMatch = src.match(new RegExp(`export\\s+type\\s+${name}\\s*=\\s*`));
  if (typeMatch) {
    const start = typeMatch.index!;
    // Find end: semicolon or newline after balanced braces/parens
    const rest = src.slice(start);
    const end = findTypeEnd(rest);
    const signature = rest.slice(0, end).trim();
    return { name, kind: 'type', signature, sourceFile: relPath, typeOnly };
  }

  // Function (including components)
  const fnMatch = src.match(new RegExp(`export\\s+function\\s+${name}\\s*[(<]`));
  if (fnMatch) {
    const start = fnMatch.index!;
    const rest = src.slice(start);
    const sigEnd = findFunctionSignatureEnd(rest);
    const signature = rest.slice(0, sigEnd).trim();
    const isComponent = /^\(props\s*:/.test(rest.slice(fnMatch[0].length - 1));
    const kind = (isComponent && /\.tsx$/.test(relPath)) ? 'component' : 'function';
    return { name, kind, signature, sourceFile: relPath, typeOnly };
  }

  // Const
  const constMatch = src.match(new RegExp(`export\\s+const\\s+${name}\\s*[=:]`));
  if (constMatch) {
    const start = constMatch.index!;
    const rest = src.slice(start);
    // Take until semicolon or end of object/array literal
    const end = findConstEnd(rest);
    const signature = rest.slice(0, end).trim();
    return { name, kind: 'const', signature, sourceFile: relPath, typeOnly };
  }

  return null;
}

function extractBraceBlock(src: string, openIndex: number): string {
  let depth = 0;
  let i = openIndex;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(openIndex, i + 1);
    }
  }
  return src.slice(openIndex, Math.min(openIndex + 500, src.length));
}

function findTypeEnd(src: string): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === stringChar && src[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '<') depth++;
    if (ch === '}' || ch === ')' || ch === '>') depth--;
    if (depth === 0 && ch === '\n' && i > 0) {
      // Check if previous non-whitespace is not an operator
      const prev = src.slice(0, i).trimEnd();
      if (!prev.endsWith('|') && !prev.endsWith('&') && !prev.endsWith(',')) {
        return i;
      }
    }
  }
  return src.length;
}

function findFunctionSignatureEnd(src: string): number {
  // Find the opening { of the function body, return everything before it
  let angleDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let stringChar = '';
  let pastParams = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === stringChar && src[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '(') parenDepth++;
    if (ch === ')') {
      parenDepth--;
      if (parenDepth === 0) pastParams = true;
    }
    // Track angle brackets but skip => arrows
    if (ch === '<' && parenDepth === 0) angleDepth++;
    if (ch === '>' && parenDepth === 0 && src[i - 1] !== '=') angleDepth--;
    // Opening brace — could be return type object literal or function body
    if (ch === '{' && pastParams && parenDepth === 0 && angleDepth <= 0) {
      // Check if this { is part of a return type annotation (preceded by ':')
      const before = src.slice(0, i).trimEnd();
      if (before.endsWith(':')) {
        // This is a return type like ): { x: number } — skip past the matching }
        let braceDepth = 1;
        let j = i + 1;
        for (; j < src.length && braceDepth > 0; j++) {
          if (src[j] === '{') braceDepth++;
          if (src[j] === '}') braceDepth--;
        }
        // Now j is past the closing } — continue scanning for the real body {
        i = j - 1;
        continue;
      }
      // Real function body — return position before the '{'
      let end = i;
      while (end > 0 && (src[end - 1] === ' ' || src[end - 1] === '\n' || src[end - 1] === '\r')) end--;
      return end;
    }
  }
  return Math.min(src.length, 200);
}

function findConstEnd(src: string): number {
  // For simple const declarations, find the semicolon or end of object literal
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === ';' && depth === 0) return i + 1;
    if (ch === '\n' && depth === 0 && i > 20) return i;
  }
  return Math.min(src.length, 200);
}

// ---------------------------------------------------------------------------
// Phase 3: Categorize
// ---------------------------------------------------------------------------

const CATEGORIES: Record<string, string[]> = {
  Components: [
    'Canvas', 'NodeShell', 'NodeContainer', 'ConnectionHandle',
    'DragHandle', 'ResizeHandle', 'DotGrid', 'CrossGrid',
    'EdgeLabel', 'ConnectionPreview',
  ],
  Hooks: [
    'useViewport', 'useConnectionDrag', 'useNodeDrag', 'useNodeResize',
    'useKeyboardShortcuts', 'useBoxSelect', 'useSelection', 'useNodeLinks',
  ],
  Context: ['CanvasContext', 'useCanvasContext'],
  Layout: ['forceDirectedLayout', 'treeLayout'],
  Geometry: [
    'computeBounds', 'isPointInRect', 'findContainerAt',
    'resolveAbsolutePosition', 'computeAttach', 'computeDetach',
    'computeContainerFit', 'toRelativePosition', 'computeOrganizerFit',
    'DEFAULT_ORGANIZER_LAYOUT',
  ],
  Performance: [
    'traceCallback', 'observeLongTasks', 'markInteraction',
    'createPerformanceMonitor',
  ],
};

interface CategorizedItem extends ApiItem {
  category: string;
}

function categorize(items: ApiItem[]): CategorizedItem[] {
  const result: CategorizedItem[] = [];
  const categorized = new Set<string>();

  // First pass: assign from category map
  for (const [category, names] of Object.entries(CATEGORIES)) {
    for (const name of names) {
      const item = items.find((i) => i.name === name);
      if (item) {
        result.push({ ...item, category });
        categorized.add(name);
      }
    }
  }

  // Types: associate with their category based on source file or props naming
  for (const item of items) {
    if (categorized.has(item.name)) continue;

    // Find category by matching source file to an already-categorized item
    const sibling = result.find((r) => r.sourceFile === item.sourceFile && !r.typeOnly);
    if (sibling) {
      result.push({ ...item, category: sibling.category });
    } else {
      // Try to match by name pattern (e.g. CanvasProps -> Components)
      const match = result.find((r) => item.name.startsWith(r.name));
      if (match) {
        result.push({ ...item, category: match.category });
      } else {
        result.push({ ...item, category: 'Other' });
      }
    }
    categorized.add(item.name);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase 4a: Generate Canvas
// ---------------------------------------------------------------------------

function deterministicId(name: string): string {
  return createHash('sha256').update(`cactus-api:${name}`).digest('hex').slice(0, 32);
}

// Format ID as UUID-like string for canvas compatibility
function toUUID(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

interface CanvasNote {
  id: string;
  title: string;
  body: string;
  parentId: null;
  x: number;
  y: number;
  w: number;
  h: number;
}

function generateCanvas(items: CategorizedItem[]): void {
  const notes: Record<string, CanvasNote> = {};
  const categoryOrder = Object.keys(CATEGORIES);
  // Add 'Other' if there are uncategorized items
  if (items.some((i) => i.category === 'Other')) categoryOrder.push('Other');

  // Also add a Types column for the canvas
  const COLUMN_WIDTH = 340;
  const COLUMN_GAP = 60;
  const NOTE_HEIGHT_BASE = 80;
  const NOTE_GAP = 20;
  const HEADER_HEIGHT = 60;

  for (let col = 0; col < categoryOrder.length; col++) {
    const category = categoryOrder[col];
    const colX = col * (COLUMN_WIDTH + COLUMN_GAP);
    let curY = 0;

    // Category header
    const headerId = toUUID(deterministicId(`header:${category}`));
    notes[headerId] = {
      id: headerId,
      title: category,
      body: '',
      parentId: null,
      x: colX,
      y: curY,
      w: COLUMN_WIDTH,
      h: HEADER_HEIGHT,
    };
    curY += HEADER_HEIGHT + NOTE_GAP;

    // Items in this category — values first, then types
    const catItems = items
      .filter((i) => i.category === category)
      .sort((a, b) => {
        // Non-types before types
        if (a.typeOnly !== b.typeOnly) return a.typeOnly ? 1 : -1;
        return 0;
      });

    for (const item of catItems) {
      const id = toUUID(deterministicId(item.name));
      const body = formatSignatureForCanvas(item);
      const lineCount = body.split('\n').length;
      const h = Math.max(NOTE_HEIGHT_BASE, 40 + lineCount * 16);

      notes[id] = {
        id,
        title: item.name,
        body,
        parentId: null,
        x: colX,
        y: curY,
        w: COLUMN_WIDTH,
        h,
      };
      curY += h + NOTE_GAP;
    }
  }

  const canvas = { notes, edges: {} };
  writeFileSync(CANVAS_OUT, JSON.stringify(canvas, null, 2) + '\n');
  console.log(`Canvas written to ${CANVAS_OUT}`);
}

function formatSignatureForCanvas(item: ApiItem): string {
  const sig = item.signature;
  // Truncate very long signatures for canvas readability
  const maxLen = 600;
  const truncated = sig.length > maxLen ? sig.slice(0, maxLen) + '\n  // ...' : sig;
  return `\`\`\`ts\n${truncated}\n\`\`\`\n\nSource: \`${item.sourceFile}\``;
}

// ---------------------------------------------------------------------------
// Phase 4b: Generate Markdown
// ---------------------------------------------------------------------------

function generateMarkdown(items: CategorizedItem[]): string {
  const lines: string[] = [];
  lines.push('# Cactus Public API Reference');
  lines.push('');
  lines.push('> Auto-generated by `scripts/extract-cactus-api.ts`');
  lines.push('');

  const categoryOrder = Object.keys(CATEGORIES);
  if (items.some((i) => i.category === 'Other')) categoryOrder.push('Other');

  for (const category of categoryOrder) {
    const catItems = items.filter((i) => i.category === category);
    if (catItems.length === 0) continue;

    lines.push(`## ${category}`);
    lines.push('');

    // Split into values and types
    const values = catItems.filter((i) => !i.typeOnly);
    const types = catItems.filter((i) => i.typeOnly);

    for (const item of values) {
      lines.push(`### ${item.name}`);
      lines.push('');
      lines.push(`**Kind:** ${item.kind} | **Source:** \`${item.sourceFile}\``);
      lines.push('');
      lines.push('```ts');
      lines.push(item.signature);
      lines.push('```');
      lines.push('');
    }

    if (types.length > 0) {
      lines.push(`### Types`);
      lines.push('');
      for (const item of types) {
        lines.push(`#### ${item.name}`);
        lines.push('');
        lines.push(`**Source:** \`${item.sourceFile}\``);
        lines.push('');
        lines.push('```ts');
        lines.push(item.signature);
        lines.push('```');
        lines.push('');
      }
    }
  }

  const exportCount = items.length;
  const valueCount = items.filter((i) => !i.typeOnly).length;
  const typeCount = items.filter((i) => i.typeOnly).length;
  lines.push('---');
  lines.push(`*${exportCount} exports total (${valueCount} values, ${typeCount} types)*`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Parsing export manifest...');
  const entries = parseExportManifest();
  console.log(`  Found ${entries.length} exports in index.ts`);

  console.log('Extracting signatures...');
  const items = extractSignatures(entries);
  console.log(`  Extracted ${items.length} signatures`);

  const missing = entries.filter((e) => !items.find((i) => i.name === e.name));
  if (missing.length > 0) {
    console.warn(`  Warning: could not extract: ${missing.map((m) => m.name).join(', ')}`);
  }

  console.log('Categorizing...');
  const categorized = categorize(items);

  console.log('Generating canvas...');
  generateCanvas(categorized);

  console.log('Generating markdown...');
  const md = generateMarkdown(categorized);

  const mdOut = process.argv[2];
  if (mdOut) {
    writeFileSync(resolve(process.cwd(), mdOut), md);
    console.log(`Markdown written to ${mdOut}`);
  } else {
    console.log('\n' + md);
  }
}

main();
