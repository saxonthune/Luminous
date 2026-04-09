#!/usr/bin/env tsx
/**
 * Solid.js Static Analysis Pipeline
 *
 * Reads Solid.js source files and emits a .canvas.json summarizing
 * component architecture, reactive data flow, and external dependencies.
 *
 * Usage: npx tsx scripts/analyze-solidjs.ts [target-dirs...] [--output path]
 *
 * Default targets: packages/client-next/src packages/cactus/src
 * Default output:  .canvases/solidjs-analysis.canvas.json
 */

import ts from 'typescript';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { resolve, relative, dirname, extname, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { tidyLayout } from '../packages/cactus/src/tidyLayout.js';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

// ---------------------------------------------------------------------------
// Intermediate types
// ---------------------------------------------------------------------------

interface ComponentInfo {
  name: string;
  sourceFile: string; // relative path from ROOT
  props: string[];
  renderedChildren: string[]; // JSX component names used inside
  parent: string | null; // enclosing component for inner components
}

interface HookInfo {
  name: string;
  sourceFile: string;
  calledBy: string | null; // component that invokes this hook
}

interface SignalInfo {
  name: string; // getter name
  sourceFile: string;
  owner: string; // component or hook name (or '__module__' for module-level)
  initialValue?: string;
}

interface StoreInfo {
  name: string;
  sourceFile: string;
  owner: string;
  shape?: string[];
}

interface MemoInfo {
  name: string;
  sourceFile: string;
  owner: string;
}

interface EffectInfo {
  name: string; // 'effect:N', 'mount:N', 'cleanup:N'
  kind: 'effect' | 'mount' | 'cleanup';
  sourceFile: string;
  owner: string;
}

interface DataSourceInfo {
  name: string; // URL or label
  kind: 'fetch' | 'websocket';
  sourceFile: string;
  owner: string;
}

interface ReactiveRead {
  producer: string; // signal/store/memo name
  consumer: string; // component/effect/memo name
  context: 'jsx' | 'effect' | 'memo' | 'unknown';
}

interface ImportRecord {
  localName: string;
  importedName: string;
  sourcePath: string; // resolved absolute path (or original if not resolved)
}

interface SolidAnalysis {
  components: ComponentInfo[];
  hooks: HookInfo[];
  signals: SignalInfo[];
  stores: StoreInfo[];
  memos: MemoInfo[];
  effects: EffectInfo[];
  dataSources: DataSourceInfo[];
  reactiveReads: ReactiveRead[];
}

// Solid.js reactive primitives — NOT treated as hooks
const SOLID_PRIMITIVES = new Set([
  'createSignal',
  'createStore',
  'createMemo',
  'createEffect',
  'onMount',
  'onCleanup',
  'createContext',
  'useContext',
  'createResource',
  'batch',
  'untrack',
]);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        // Skip node_modules and dist
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
      } else if (stat.isFile()) {
        const ext = extname(entry);
        if (ext === '.ts' || ext === '.tsx') {
          files.push(full);
        }
      }
    }
  }
  walk(dir);
  return files;
}

// ---------------------------------------------------------------------------
// Deterministic ID helpers (same pattern as extract-cactus-api.ts)
// ---------------------------------------------------------------------------

function deterministicId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function toUUID(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function entityId(type: string, name: string, sourceFile: string): string {
  return toUUID(deterministicId(`solidjs-pipeline:${type}:${name}:${sourceFile}`));
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function getText(node: ts.Node, source: string): string {
  return source.slice(node.getStart(), node.getEnd());
}

function hasJsx(node: ts.Node): boolean {
  if (
    node.kind === ts.SyntaxKind.JsxElement ||
    node.kind === ts.SyntaxKind.JsxSelfClosingElement ||
    node.kind === ts.SyntaxKind.JsxFragment
  ) {
    return true;
  }
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found) found = hasJsx(child);
  });
  return found;
}

function callsReactivePrimitive(node: ts.Node): boolean {
  let found = false;
  ts.forEachChild(node, function visit(child) {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      const name = ts.isIdentifier(expr) ? expr.text : null;
      if (name && SOLID_PRIMITIVES.has(name)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  });
  return found;
}

/** Extract JSX component tag names (capitalized) from a node's subtree */
function extractJsxComponentNames(node: ts.Node, source: string): string[] {
  const names: string[] = [];
  function visit(n: ts.Node) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = getText(n.tagName, source);
      // Only capitalized names are components (lower = HTML elements)
      if (/^[A-Z]/.test(tagName)) {
        names.push(tagName);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return names;
}

/** Get the name from a FunctionDeclaration or the variable name for ArrowFunction/FunctionExpression */
function getFunctionName(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  source: string
): string | null {
  if (ts.isFunctionDeclaration(node)) {
    return node.name ? node.name.text : null;
  }
  // For arrow/function expressions, look at the parent VariableDeclarator
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) {
    const nameNode = parent.name;
    if (ts.isIdentifier(nameNode)) {
      return nameNode.text;
    }
  }
  return null;
}

/** Extract props parameter type names from a function */
function extractProps(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression
): string[] {
  if (node.parameters.length === 0) return [];
  const first = node.parameters[0];
  if (first.type) {
    if (ts.isTypeReferenceNode(first.type) && ts.isIdentifier(first.type.typeName)) {
      return [first.type.typeName.text];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Phase 1: Per-file AST analysis
// ---------------------------------------------------------------------------

function analyzeFile(
  filePath: string,
  relPath: string,
  analysis: SolidAnalysis
): Map<string, ImportRecord[]> {
  const source = readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const imports = new Map<string, ImportRecord[]>(); // localName -> records
  const fileImports: ImportRecord[] = [];

  // Context stack: each entry is { name, isComponent, isHook }
  const contextStack: Array<{
    name: string;
    kind: 'component' | 'hook' | 'effect' | 'other';
  }> = [];

  function currentOwner(): string {
    for (let i = contextStack.length - 1; i >= 0; i--) {
      const ctx = contextStack[i];
      if (ctx.kind === 'component' || ctx.kind === 'hook') return ctx.name;
    }
    return '__module__';
  }

  function currentContext(): 'component' | 'hook' | 'effect' | 'other' | null {
    if (contextStack.length === 0) return null;
    return contextStack[contextStack.length - 1].kind;
  }

  // Counters for anonymous effects
  let effectCount = 0;
  let mountCount = 0;
  let cleanupCount = 0;

  function visitNode(node: ts.Node) {
    // Import declarations
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const from = moduleSpecifier.text;
        const clause = node.importClause;
        if (clause) {
          if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            for (const el of clause.namedBindings.elements) {
              const localName = el.name.text;
              const importedName = el.propertyName ? el.propertyName.text : el.name.text;
              fileImports.push({ localName, importedName, sourcePath: from });
            }
          }
          if (clause.name) {
            fileImports.push({ localName: clause.name.text, importedName: 'default', sourcePath: from });
          }
        }
      }
      return; // don't recurse into imports
    }

    // Function declarations and arrow/function expressions inside variable declarations
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const name = getFunctionName(node, source);
      if (name) {
        processFunctionNode(node, name);
        return; // processFunctionNode handles recursion inside the function
      }
    }

    // createSignal / createStore / createMemo at module level (not inside a function)
    if (ts.isCallExpression(node)) {
      if (contextStack.length === 0) {
        // Module-level reactive call
        const callName = ts.isIdentifier(node.expression) ? node.expression.text : null;
        if (callName === 'createSignal') {
          const sigName = extractSignalName(node);
          if (sigName) {
            analysis.signals.push({
              name: sigName,
              sourceFile: relPath,
              owner: '__module__',
              initialValue: extractFirstArgText(node, source),
            });
          }
        } else if (callName === 'createEffect') {
          const n = `effect:${++effectCount}`;
          analysis.effects.push({ name: n, kind: 'effect', sourceFile: relPath, owner: '__module__' });
        } else if (callName === 'onMount') {
          const n = `mount:${++mountCount}`;
          analysis.effects.push({ name: n, kind: 'mount', sourceFile: relPath, owner: '__module__' });
        }
      }
    }

    ts.forEachChild(node, visitNode);
  }

  function processFunctionNode(
    node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
    name: string
  ) {
    const body = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      ? node.body
      : node.body;

    if (!body) {
      ts.forEachChild(node, visitNode);
      return;
    }

    const bodyContainsJsx = hasJsx(body);
    const bodyCallsReactive = callsReactivePrimitive(body);

    const isComponent =
      bodyContainsJsx &&
      /^[A-Z]/.test(name);

    const isHook =
      !bodyContainsJsx &&
      bodyCallsReactive &&
      (name.startsWith('use') || name.startsWith('create')) &&
      !SOLID_PRIMITIVES.has(name);

    const enclosingComponent = contextStack
      .slice()
      .reverse()
      .find((c) => c.kind === 'component')?.name ?? null;

    if (isComponent) {
      const renderedChildren = extractJsxComponentNames(body, source);
      const props = extractProps(node);
      analysis.components.push({
        name,
        sourceFile: relPath,
        props,
        renderedChildren: [...new Set(renderedChildren)],
        parent: enclosingComponent,
      });
      contextStack.push({ name, kind: 'component' });
      ts.forEachChild(body, visitBodyNode);
      contextStack.pop();
    } else if (isHook) {
      analysis.hooks.push({ name, sourceFile: relPath, calledBy: null });
      contextStack.push({ name, kind: 'hook' });
      ts.forEachChild(body, visitBodyNode);
      contextStack.pop();
    } else {
      // Regular function — still walk it (may contain reactive calls with enclosing owner)
      contextStack.push({ name, kind: 'other' });
      ts.forEachChild(body, visitBodyNode);
      contextStack.pop();
    }
  }

  function visitBodyNode(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callName = ts.isIdentifier(node.expression) ? node.expression.text : null;

      if (callName === 'createSignal') {
        const sigName = extractSignalName(node);
        if (sigName) {
          analysis.signals.push({
            name: sigName,
            sourceFile: relPath,
            owner: currentOwner(),
            initialValue: extractFirstArgText(node, source),
          });
        }
      } else if (callName === 'createStore') {
        const storeName = extractStoreName(node);
        if (storeName) {
          analysis.stores.push({
            name: storeName,
            sourceFile: relPath,
            owner: currentOwner(),
          });
        }
      } else if (callName === 'createMemo') {
        const memoName = extractMemoName(node);
        if (memoName) {
          analysis.memos.push({ name: memoName, sourceFile: relPath, owner: currentOwner() });
        }
      } else if (callName === 'createEffect') {
        const n = `effect:${++effectCount}`;
        const owner = currentOwner();
        analysis.effects.push({ name: n, kind: 'effect', sourceFile: relPath, owner });
        // Walk inside the effect callback for data sources
        const callback = node.arguments[0];
        if (callback) {
          contextStack.push({ name: n, kind: 'effect' });
          ts.forEachChild(callback, visitBodyNode);
          contextStack.pop();
        }
        return;
      } else if (callName === 'onMount') {
        const n = `mount:${++mountCount}`;
        const owner = currentOwner();
        analysis.effects.push({ name: n, kind: 'mount', sourceFile: relPath, owner });
        const callback = node.arguments[0];
        if (callback) {
          contextStack.push({ name: n, kind: 'effect' });
          ts.forEachChild(callback, visitBodyNode);
          contextStack.pop();
        }
        return;
      } else if (callName === 'onCleanup') {
        const n = `cleanup:${++cleanupCount}`;
        analysis.effects.push({ name: n, kind: 'cleanup', sourceFile: relPath, owner: currentOwner() });
      } else if (callName === 'fetch') {
        const urlArg = node.arguments[0];
        const urlText = urlArg ? extractStringOrTemplate(urlArg, source) : '(dynamic)';
        analysis.dataSources.push({
          name: urlText,
          kind: 'fetch',
          sourceFile: relPath,
          owner: currentOwner(),
        });
      }
    }

    // new WebSocket(...)
    if (ts.isNewExpression(node)) {
      const ctorName = ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (ctorName === 'WebSocket') {
        const urlArg = node.arguments?.[0];
        const urlText = urlArg ? extractStringOrTemplate(urlArg, source) : '(dynamic)';
        analysis.dataSources.push({
          name: urlText,
          kind: 'websocket',
          sourceFile: relPath,
          owner: currentOwner(),
        });
      }
    }

    // Nested function declarations inside bodies
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const name = getFunctionName(node, source);
      if (name) {
        processFunctionNode(node, name);
        return;
      }
    }

    ts.forEachChild(node, visitBodyNode);
  }

  function extractSignalName(callNode: ts.CallExpression): string | null {
    // const [getter, setter] = createSignal(...)
    const parent = callNode.parent;
    if (!parent) return null;
    if (ts.isVariableDeclaration(parent)) {
      const nameNode = parent.name;
      if (ts.isArrayBindingPattern(nameNode) && nameNode.elements.length > 0) {
        const first = nameNode.elements[0];
        if (ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
          return first.name.text;
        }
      }
      if (ts.isIdentifier(nameNode)) {
        return nameNode.text;
      }
    }
    return null;
  }

  function extractStoreName(callNode: ts.CallExpression): string | null {
    const parent = callNode.parent;
    if (!parent) return null;
    if (ts.isVariableDeclaration(parent)) {
      const nameNode = parent.name;
      if (ts.isArrayBindingPattern(nameNode) && nameNode.elements.length > 0) {
        const first = nameNode.elements[0];
        if (ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
          return first.name.text;
        }
      }
      if (ts.isIdentifier(nameNode)) {
        return nameNode.text;
      }
    }
    return null;
  }

  function extractMemoName(callNode: ts.CallExpression): string | null {
    const parent = callNode.parent;
    if (!parent) return null;
    if (ts.isVariableDeclaration(parent)) {
      const nameNode = parent.name;
      if (ts.isIdentifier(nameNode)) return nameNode.text;
    }
    return null;
  }

  function extractFirstArgText(callNode: ts.CallExpression, src: string): string | undefined {
    if (callNode.arguments.length === 0) return undefined;
    const arg = callNode.arguments[0];
    return getText(arg, src).slice(0, 60);
  }

  function extractStringOrTemplate(node: ts.Node, src: string): string {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) return getText(node, src).slice(0, 80);
    return getText(node, src).slice(0, 80);
  }

  // Walk the file
  ts.forEachChild(sf, visitNode);

  // Store import records for this file
  for (const rec of fileImports) {
    if (!imports.has(rec.localName)) imports.set(rec.localName, []);
    imports.get(rec.localName)!.push(rec);
  }

  return imports;
}

// ---------------------------------------------------------------------------
// Phase 1b: Cross-file resolution
// ---------------------------------------------------------------------------

function resolveImportPath(from: string, importedFrom: string): string | null {
  if (importedFrom.startsWith('.')) {
    const base = resolve(dirname(from), importedFrom);
    // Try .ts, .tsx
    for (const ext of ['.ts', '.tsx', '']) {
      const candidate = ext ? base.replace(/\.js$/, ext) : base;
      if (existsSync(candidate)) return candidate;
    }
    // Try replacing .js with .ts or .tsx
    const noExt = base.replace(/\.(js|ts|tsx)$/, '');
    for (const ext of ['.ts', '.tsx']) {
      if (existsSync(noExt + ext)) return noExt + ext;
    }
  }
  return null;
}

function crossFileResolution(
  analysis: SolidAnalysis,
  fileImportMaps: Map<string, Map<string, ImportRecord[]>>,
  relPathMap: Map<string, string> // absPath -> relPath
): void {
  // Build lookup: signal getter name -> SignalInfo
  const signalsByName = new Map<string, SignalInfo>();
  for (const sig of analysis.signals) {
    signalsByName.set(sig.name, sig);
  }
  const memosByName = new Map<string, MemoInfo>();
  for (const m of analysis.memos) {
    memosByName.set(m.name, m);
  }

  // Determine hook calledBy: look at component bodies and see if they call known hooks
  const hookNames = new Set(analysis.hooks.map((h) => h.name));
  for (const comp of analysis.components) {
    // For each hook called in this component, set hook.calledBy = comp.name
    // We'll do this by looking at recorded JSX children and known hooks
    // Hook calls are detected when we see a hook name as a CalledExpression inside a component
    // We do this statically from the hookCallSites collected during analysis
  }

  // For now, use the hookCallSites data collected in a separate pass
  // (handled via the analysis.hooks entries that have calledBy already set or null)
}

// ---------------------------------------------------------------------------
// Second pass: detect reactive reads and hook call sites
// ---------------------------------------------------------------------------

function detectReactiveReadsAndHookCalls(
  filePath: string,
  relPath: string,
  analysis: SolidAnalysis
): void {
  const source = readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // All known signal getter names
  const signalNames = new Set(analysis.signals.map((s) => s.name));
  const memoNames = new Set(analysis.memos.map((m) => m.name));
  const hookNames = new Set(analysis.hooks.map((h) => h.name));

  const contextStack: Array<{ name: string; kind: 'component' | 'hook' | 'effect' | 'other' }> = [];

  function currentOwner(): string {
    for (let i = contextStack.length - 1; i >= 0; i--) {
      const c = contextStack[i];
      if (c.kind === 'component' || c.kind === 'hook') return c.name;
    }
    return '__module__';
  }

  function effectContext(): string | null {
    for (let i = contextStack.length - 1; i >= 0; i--) {
      if (contextStack[i].kind === 'effect') return contextStack[i].name;
    }
    return null;
  }

  function isInsideJsx(): boolean {
    // Walk up — if the nearest context is a component, we might be in JSX
    // This is a rough heuristic; we check if we're in a JSX expression
    return false; // simplified — will mark as 'unknown'
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) return;

    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const name = getFunctionName(node, source);
      if (name) {
        const body = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ? node.body : node.body;
        if (!body) { ts.forEachChild(node, visit); return; }

        const isComp = hasJsx(body) && /^[A-Z]/.test(name);
        const isHook =
          !hasJsx(body) &&
          callsReactivePrimitive(body) &&
          (name.startsWith('use') || name.startsWith('create')) &&
          !SOLID_PRIMITIVES.has(name);

        const kind = isComp ? 'component' : isHook ? 'hook' : 'other';
        contextStack.push({ name, kind });
        ts.forEachChild(body, visit);
        contextStack.pop();
        return;
      }
    }

    // Call expressions
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const callName = ts.isIdentifier(callee) ? callee.text : null;

      // Detect reactive reads: signal() or memo()
      if (callName && (signalNames.has(callName) || memoNames.has(callName))) {
        const owner = currentOwner();
        const sig = analysis.signals.find((s) => s.name === callName);
        const memo = analysis.memos.find((m) => m.name === callName);
        const producer = sig || memo;
        if (producer && producer.owner !== owner && owner !== '__module__') {
          const effectCtx = effectContext();
          const context = effectCtx ? 'effect' : 'unknown';
          // Check if already recorded
          const exists = analysis.reactiveReads.some(
            (r) => r.producer === callName && r.consumer === owner
          );
          if (!exists) {
            analysis.reactiveReads.push({ producer: callName, consumer: owner, context });
          }
        }
      }

      // Detect hook call sites
      if (callName && hookNames.has(callName)) {
        const owner = currentOwner();
        const hook = analysis.hooks.find((h) => h.name === callName);
        if (hook && hook.calledBy === null && owner !== '__module__') {
          hook.calledBy = owner;
        }
      }

      // createEffect/onMount callbacks — push effect context
      if (callName === 'createEffect' || callName === 'onMount') {
        const callback = node.arguments[0];
        if (callback) {
          const effectName = analysis.effects.find(
            (e) =>
              e.sourceFile === relPath &&
              (e.kind === 'effect' || e.kind === 'mount') &&
              e.owner === currentOwner()
          )?.name ?? null;
          if (effectName) {
            contextStack.push({ name: effectName, kind: 'effect' });
            ts.forEachChild(callback, visit);
            contextStack.pop();
            return;
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
}

// ---------------------------------------------------------------------------
// Phase 2: Transform to canvas format
// ---------------------------------------------------------------------------

interface CanvasNode {
  id: string;
  type: 'note';
  title: string;
  body: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parentId: string | null;
  kind?: string;
}

interface CanvasEdge {
  id: string;
  fromId: string;
  toId: string;
  label: string | null;
}

interface CanvasDocument {
  notes: Record<string, CanvasNode>;
  edges: Record<string, CanvasEdge>;
}

// Layout constants
const COL_WIDTH = 300;
const COL_GAP = 40;
const ROW_GAP = 20;
const HEADER_H = 60;
const ITEM_H_BASE = 80;
const ITEM_H_LARGE = 100;

function buildCanvas(analysis: SolidAnalysis): CanvasDocument {
  const notes: Record<string, CanvasNode> = {};
  const edges: Record<string, CanvasEdge> = {};

  // Helper to add a note
  function addNote(n: CanvasNode) {
    notes[n.id] = n;
  }

  // Build a lookup of entity IDs by name for edges
  const entityIdMap = new Map<string, string>(); // name -> id

  // --- Components ---
  for (const comp of analysis.components) {
    const id = entityId('component', comp.name, comp.sourceFile);
    entityIdMap.set(comp.name, id);
    const body = [
      `Source: \`${comp.sourceFile}\``,
      comp.props.length > 0 ? `Props: ${comp.props.join(', ')}` : '',
      comp.parent ? `Inner component of: ${comp.parent}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    addNote({
      id,
      type: 'note',
      title: `[Component] ${comp.name}`,
      body,
      x: 0,
      y: 0,
      w: COL_WIDTH,
      h: ITEM_H_BASE,
      parentId: null, // will be set in layout phase
      kind: 'component',
    });
  }

  // --- Hooks ---
  for (const hook of analysis.hooks) {
    const id = entityId('hook', hook.name, hook.sourceFile);
    entityIdMap.set(hook.name, id);
    addNote({
      id,
      type: 'note',
      title: `[Hook] ${hook.name}`,
      body: `Source: \`${hook.sourceFile}\``,
      x: 0,
      y: 0,
      w: COL_WIDTH,
      h: ITEM_H_BASE,
      parentId: null,
      kind: 'hook',
    });
  }

  // --- Signals ---
  for (const sig of analysis.signals) {
    const id = entityId('signal', sig.name, sig.sourceFile);
    entityIdMap.set(sig.name, id);
    const body = [
      `Source: \`${sig.sourceFile}\``,
      sig.initialValue ? `Initial: \`${sig.initialValue}\`` : '',
      `Owner: ${sig.owner}`,
    ]
      .filter(Boolean)
      .join('\n');
    addNote({
      id,
      type: 'note',
      title: `[Signal] ${sig.name}`,
      body,
      x: 0,
      y: 0,
      w: COL_WIDTH,
      h: ITEM_H_BASE,
      parentId: null,
      kind: 'signal',
    });
  }

  // --- Stores ---
  for (const store of analysis.stores) {
    const id = entityId('store', store.name, store.sourceFile);
    entityIdMap.set(store.name, id);
    addNote({
      id,
      type: 'note',
      title: `[Store] ${store.name}`,
      body: `Source: \`${store.sourceFile}\`\nOwner: ${store.owner}`,
      x: 0,
      y: 0,
      w: COL_WIDTH,
      h: ITEM_H_BASE,
      parentId: null,
      kind: 'store',
    });
  }

  // --- Memos ---
  for (const memo of analysis.memos) {
    const id = entityId('memo', memo.name, memo.sourceFile);
    entityIdMap.set(memo.name, id);
    addNote({
      id,
      type: 'note',
      title: `[Memo] ${memo.name}`,
      body: `Source: \`${memo.sourceFile}\`\nOwner: ${memo.owner}`,
      x: 0,
      y: 0,
      w: COL_WIDTH,
      h: ITEM_H_BASE,
      parentId: null,
      kind: 'memo',
    });
  }

  // --- Effects ---
  for (const effect of analysis.effects) {
    const id = entityId('effect', effect.name, effect.sourceFile);
    entityIdMap.set(effect.name, id);
    addNote({
      id,
      type: 'note',
      title: `[Effect:${effect.kind}] ${effect.name}`,
      body: `Source: \`${effect.sourceFile}\`\nOwner: ${effect.owner}`,
      x: 0,
      y: 0,
      w: COL_WIDTH,
      h: ITEM_H_BASE,
      parentId: null,
      kind: `effect-${effect.kind}`,
    });
  }

  // --- DataSources ---
  for (const ds of analysis.dataSources) {
    const dsKey = `${ds.kind}:${ds.name}`;
    const id = entityId('datasource', dsKey, ds.sourceFile);
    entityIdMap.set(dsKey, id);
    addNote({
      id,
      type: 'note',
      title: `[DataSource:${ds.kind}] ${ds.name}`,
      body: `Source: \`${ds.sourceFile}\`\nOwner: ${ds.owner}`,
      x: 0,
      y: 0,
      w: COL_WIDTH,
      h: ITEM_H_BASE,
      parentId: null,
      kind: `datasource-${ds.kind}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Set parentId relationships
  // ---------------------------------------------------------------------------

  // Component rendered in JSX → parentId = rendering component (first renderer wins)
  for (const comp of analysis.components) {
    for (const childName of comp.renderedChildren) {
      const childId = entityIdMap.get(childName);
      const parentId = entityIdMap.get(comp.name);
      if (childId && parentId && notes[childId] && notes[childId].parentId === null) {
        notes[childId].parentId = parentId;
      }
    }
  }

  // Component parent (inner components — defined lexically inside another component)
  for (const comp of analysis.components) {
    if (comp.parent) {
      const compId = entityIdMap.get(comp.name);
      const parentId = entityIdMap.get(comp.parent);
      if (compId && parentId && notes[compId]) {
        notes[compId].parentId = parentId;
      }
    }
  }

  // Hook → calling component
  for (const hook of analysis.hooks) {
    if (hook.calledBy) {
      const hookId = entityIdMap.get(hook.name);
      const parentId = entityIdMap.get(hook.calledBy);
      if (hookId && parentId && notes[hookId]) {
        notes[hookId].parentId = parentId;
      }
    }
  }

  // Signal/Store/Memo/Effect → their owner
  function setOwnerParent(name: string, owner: string, file: string) {
    if (owner === '__module__') return; // module-level, no parent
    const itemId = entityIdMap.get(name);
    if (!itemId || !notes[itemId]) return;
    // Owner could be a component, hook, or effect
    const ownerCompId = entityIdMap.get(owner);
    if (ownerCompId && notes[ownerCompId]) {
      notes[itemId].parentId = ownerCompId;
    }
  }

  for (const sig of analysis.signals) {
    setOwnerParent(sig.name, sig.owner, sig.sourceFile);
  }
  for (const store of analysis.stores) {
    setOwnerParent(store.name, store.owner, store.sourceFile);
  }
  for (const memo of analysis.memos) {
    setOwnerParent(memo.name, memo.owner, memo.sourceFile);
  }
  for (const effect of analysis.effects) {
    setOwnerParent(effect.name, effect.owner, effect.sourceFile);
  }

  // DataSource → owner (effect or component)
  for (const ds of analysis.dataSources) {
    const dsKey = `${ds.kind}:${ds.name}`;
    const dsId = entityIdMap.get(dsKey);
    if (!dsId || !notes[dsId]) continue;
    if (ds.owner === '__module__') continue;
    const ownerEffectId = entityIdMap.get(ds.owner);
    if (ownerEffectId && notes[ownerEffectId]) {
      notes[dsId].parentId = ownerEffectId;
    }
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  function kindOrder(kind: string | undefined): number {
    if (!kind) return 5;
    if (kind === 'signal' || kind === 'store') return 0;
    if (kind === 'memo') return 1;
    if (kind.startsWith('effect') || kind.startsWith('datasource')) return 2;
    if (kind === 'hook') return 3;
    if (kind === 'component') return 4;
    return 5;
  }

  // Pre-sort nodes so that tidyLayout preserves kind order within each parent.
  // Root nodes: components first, then hooks, then other.
  // Child nodes: by kindOrder.
  const sortedNodes = Object.values(notes).sort((a, b) => {
    // Sort by parentId group first (null roots together), then by kind
    const aIsRoot = a.parentId === null;
    const bIsRoot = b.parentId === null;
    if (aIsRoot && bIsRoot) {
      const aOrder = a.kind === 'component' ? 0 : a.kind === 'hook' ? 1 : 2;
      const bOrder = b.kind === 'component' ? 0 : b.kind === 'hook' ? 1 : 2;
      return aOrder - bOrder;
    }
    return kindOrder(a.kind) - kindOrder(b.kind);
  });

  const layoutResult = tidyLayout(
    sortedNodes.map((n) => ({ id: n.id, w: n.w, h: n.h, parentId: n.parentId ?? null })),
    { padding: 10, headerHeight: HEADER_H, gap: ROW_GAP, maxWidth: 1400, rootGap: 60 },
  );

  for (const [id, rect] of layoutResult) {
    notes[id].x = rect.x;
    notes[id].y = rect.y;
    notes[id].w = rect.w;
    notes[id].h = rect.h;
  }

  // ---------------------------------------------------------------------------
  // Edges: ReactiveRead cross-boundary
  // ---------------------------------------------------------------------------

  for (const read of analysis.reactiveReads) {
    const fromId = entityIdMap.get(read.producer);
    const toId = entityIdMap.get(read.consumer);
    if (!fromId || !toId) continue;
    const edgeId = toUUID(deterministicId(`edge:${read.producer}->${read.consumer}`));
    edges[edgeId] = {
      id: edgeId,
      fromId,
      toId,
      label: `reads in ${read.context}`,
    };
  }

  return { notes, edges };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  // Parse CLI
  const outputIdx = args.indexOf('--output');
  let outputPath =
    outputIdx >= 0 ? args[outputIdx + 1] : resolve(ROOT, '.canvases/solidjs-analysis.canvas.json');

  const targetDirs = args
    .filter((a, i) => a !== '--output' && (outputIdx < 0 || i !== outputIdx + 1))
    .map((d) => resolve(ROOT, d));

  if (targetDirs.length === 0) {
    targetDirs.push(
      resolve(ROOT, 'packages/client-next/src'),
      resolve(ROOT, 'packages/cactus/src')
    );
  }

  // Discover files
  const allFiles: string[] = [];
  for (const dir of targetDirs) {
    if (!existsSync(dir)) {
      console.warn(`Warning: target directory does not exist: ${dir}`);
      continue;
    }
    allFiles.push(...findSourceFiles(dir));
  }

  console.log(`Phase 1: Analyzing ${allFiles.length} files...`);

  const analysis: SolidAnalysis = {
    components: [],
    hooks: [],
    signals: [],
    stores: [],
    memos: [],
    effects: [],
    dataSources: [],
    reactiveReads: [],
  };

  const fileImportMaps = new Map<string, Map<string, ImportRecord[]>>();
  const relPathMap = new Map<string, string>();

  for (const filePath of allFiles) {
    const relPath = relative(ROOT, filePath);
    relPathMap.set(filePath, relPath);
    const imports = analyzeFile(filePath, relPath, analysis);
    fileImportMaps.set(filePath, imports);
  }

  console.log(
    `  Components: ${analysis.components.length}, Hooks: ${analysis.hooks.length}, ` +
      `Signals: ${analysis.signals.length}, Stores: ${analysis.stores.length}, ` +
      `Memos: ${analysis.memos.length}, Effects: ${analysis.effects.length}, ` +
      `DataSources: ${analysis.dataSources.length}`
  );

  // Warn about unattributed entities
  const unowned = [
    ...analysis.signals.filter((s) => s.owner === '__module__'),
    ...analysis.effects.filter((e) => e.owner === '__module__'),
  ];
  if (unowned.length > 0) {
    console.log(`  Module-level entities (no owner): ${unowned.map((e) => e.name).join(', ')}`);
  }

  console.log('Phase 1b: Detecting reactive reads and hook call sites...');

  for (const filePath of allFiles) {
    const relPath = relative(ROOT, filePath);
    detectReactiveReadsAndHookCalls(filePath, relPath, analysis);
  }

  console.log(`  Reactive reads detected: ${analysis.reactiveReads.length}`);

  console.log('Phase 2: Generating canvas...');

  const canvas = buildCanvas(analysis);
  const nodeCount = Object.keys(canvas.notes).length;
  const edgeCount = Object.keys(canvas.edges).length;

  console.log(`  Nodes: ${nodeCount}, Edges: ${edgeCount}`);

  // Ensure output directory exists
  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outputPath, JSON.stringify(canvas, null, 2) + '\n');
  console.log(`Canvas written to ${outputPath}`);
}

main();
