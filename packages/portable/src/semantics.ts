import type { PortableGraph, PortableDiagram, PortableTheme } from './graph.js';

export type Severity = 'warning' | 'error';
export type RuleSetting = Severity | 'off';
export interface Model {
  version: 1;
  recipe?: string;
  vocabulary: Record<string, { label: string }>;
  presentation: Record<string, string>;
  validation?: { rules: Record<string, RuleSetting> };
}
export interface Diagnostic {
  ruleId: string;
  severity: Severity;
  message: string;
  canvasId?: string;
  elementIds?: string[];
  line?: number;
  suggestion?: string;
}
export type LegendInput = { kind: string; label?: string } | NonNullable<NonNullable<PortableDiagram['settings']>['legend']>['entries'][number];
export interface ParsedDiagram {
  id: string;
  graph: PortableGraph;
  line: number;
  mode?: 'action-flow' | 'rest-api-tree';
  settings?: Omit<NonNullable<PortableDiagram['settings']>, 'legend'> & {
    kinds?: Record<string, string>;
    legend?: { entries: LegendInput[] };
  };
}
export interface ParsedDocument { html: string; diagrams: ParsedDiagram[]; model?: Model; info?: Record<string, import('./import/extended-info.js').InfoInput> }
export interface RuleContext { diagram: ParsedDiagram; model?: Model }
export interface RuleFinding { message: string; elementIds?: string[]; suggestion?: string }
export interface ValidationRule { id: string; check(context: RuleContext): RuleFinding[] }
export interface Recipe { rules: Record<string, RuleSetting>; vocabulary?: Model['vocabulary']; presentation?: Model['presentation'] }

/** Trusted code registry: add named rules/recipes here, never evaluate source code from Markdown. */
export const rules: Record<string, ValidationRule> = {
  'legend/coverage': {
    id: 'legend/coverage',
    check({ diagram }) {
      const covered = new Set((diagram.settings?.legend?.entries ?? []).map(e => 'kind' in e ? `kind:${e.kind}` : 'diff' in e ? `diff:${e.diff}` : `class:${e.class}`));
      const uses = new Map<string, string[]>();
      for (const node of diagram.graph.nodes) {
        const meanings = [...(node.kind ? [`kind:${node.kind}`] : []), ...(node.card?.diff ? [`diff:${node.card.diff}`] : [])];
        for (const meaning of meanings) uses.set(meaning, [...(uses.get(meaning) ?? []), node.id]);
      }
      return [...uses].filter(([meaning]) => !covered.has(meaning)).map(([meaning, elementIds]) => ({
        message: `Meaning ${meaning} is used but absent from this canvas's legend.`, elementIds,
        suggestion: `Add an entry for ${meaning} to this canvas's legend.`,
      }));
    },
  },
  'nodes/kind-required': {
    id: 'nodes/kind-required',
    check: ({ diagram }) => diagram.graph.nodes.filter(n => !n.kind).map(n => ({ message: 'Architecture nodes and containers require a declared kind.', elementIds: [n.id], suggestion: 'Declare the node in portable-canvas.kinds.' })),
  },
};
export const recipes: Record<string, Recipe> = {
  standard: { rules: { 'legend/coverage': 'warning' } },
  architecture: { rules: { 'legend/coverage': 'error', 'nodes/kind-required': 'error' } },
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a mapping`);
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, keys: string[], label: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${label}: unknown field ${key}`);
}
function name(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a nonempty string`);
}
export function parseModel(input: unknown): Model {
  const model = object(input, 'portable-model');
  fields(model, ['version', 'recipe', 'vocabulary', 'presentation', 'validation'], 'portable-model');
  if (model.version !== 1) throw new Error('portable-model requires version: 1');
  if (model.recipe !== undefined) name(model.recipe, 'recipe');
  for (const [id, value] of Object.entries(object(model.vocabulary, 'vocabulary'))) {
    name(id, 'kind ID'); const entry = object(value, `vocabulary.${id}`); fields(entry, ['label'], `vocabulary.${id}`); name(entry.label, `vocabulary.${id}.label`);
  }
  for (const [id, slot] of Object.entries(object(model.presentation, 'presentation'))) { name(id, 'kind ID'); name(slot, `presentation.${id}`); }
  if (model.validation !== undefined) {
    const validation = object(model.validation, 'validation'); fields(validation, ['rules'], 'validation');
    for (const [id, setting] of Object.entries(object(validation.rules, 'validation.rules'))) {
      if (!['off', 'warning', 'error'].includes(setting as string)) throw new Error(`Invalid severity for ${id}`);
    }
  }
  return model as unknown as Model;
}

/** Resolve and check all canvases before layout. Presentation projection happens only on success. */
export function validateDocument(document: ParsedDocument, theme?: PortableTheme): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const error = (ruleId: string, message: string, d?: ParsedDiagram, ids?: string[]) => diagnostics.push({ ruleId, severity: 'error', message, canvasId: d?.id, elementIds: ids, line: d?.line });
  const declared = document.model;
  if (declared && !Object.hasOwn(recipes, declared.recipe ?? 'standard')) error('reference/recipe', `Unknown recipe ${declared.recipe}`);
  const recipe = recipes[declared?.recipe ?? 'standard'];
  const model = declared ? { ...declared, vocabulary: { ...recipe?.vocabulary, ...declared.vocabulary }, presentation: { ...recipe?.presentation, ...declared.presentation } } : undefined;
  const policy = model ? { ...recipe?.rules, ...model.validation?.rules } : {};
  for (const id of Object.keys(policy)) if (!Object.hasOwn(rules, id)) error('reference/rule', `Unknown validation rule ${id}`);
  if (model) {
    for (const id of Object.keys(model.presentation)) {
      if (!Object.hasOwn(model.vocabulary, id)) error('reference/kind', `Presentation references unknown kind ${id}`);
      if (!theme?.styles[model.presentation[id]]) error('reference/theme', `Kind ${id} references missing theme slot ${model.presentation[id]}`);
    }
  }
  for (const diagram of document.diagrams) {
    const before = diagnostics.length;
    const kinds = diagram.settings?.kinds ?? {};
    if (diagram.mode === 'action-flow' && diagram.settings?.layout?.nonOrderingEdges.length) error('layout/unsupported-hint', 'nonOrderingEdges is supported only by ordinary Mermaid layout', diagram);
    for (const hint of diagram.settings?.layout?.nonOrderingEdges ?? []) {
      if (!diagram.graph.edges.some(edge => edge.source === hint.source && edge.target === hint.target)) error('reference/edge', `No edge from ${hint.source} to ${hint.target} for layout hint`, diagram);
    }
    for (const id of Object.keys(kinds)) if (!diagram.graph.nodes.some(n => n.id === id)) error('reference/node', `Unknown node ${id} in kinds`, diagram, [id]);
    for (const node of diagram.graph.nodes) {
      if (node.card?.info && (!document.info || !Object.hasOwn(document.info, node.card.info))) error('reference/info', `Unknown Extended Info ID ${node.card.info}`, diagram, [node.id]);
      node.kind = kinds[node.id];
      if (node.kind) {
        if (!model || !Object.hasOwn(model.vocabulary, node.kind)) error('reference/kind', `Unknown kind ${node.kind}`, diagram, [node.id]);
        else if (!Object.hasOwn(model.presentation, node.kind)) error('reference/theme', `No presentation binding for kind ${node.kind}`, diagram, [node.id]);
        const themed = node.classes.filter(c => theme?.styles[c]);
        if (themed.some(c => c !== model?.presentation[node.kind!])) error('presentation/conflict', `Theme classes conflict with kind ${node.kind}; remove semantic styling from Mermaid`, diagram, [node.id]);
      } else if (model && node.classes.some(c => theme?.styles[c])) error('reference/kind', 'A themed node must declare its meaning in kinds', diagram, [node.id]);
    }
    for (const entry of diagram.settings?.legend?.entries ?? []) {
      if ('kind' in entry) {
        if (!model || !Object.hasOwn(model.vocabulary, entry.kind)) error('reference/kind', `Unknown legend kind ${entry.kind}`, diagram);
        else if (!model.presentation[entry.kind]) error('reference/theme', `No presentation binding for legend kind ${entry.kind}`, diagram);
      } else if ('class' in entry && !theme?.styles[entry.class]) error('reference/theme', `Unknown legend theme class ${entry.class}`, diagram);
    }
    if (diagnostics.length !== before) continue;
    for (const [id, severity] of Object.entries(policy)) {
      if (severity === 'off' || !Object.hasOwn(rules, id)) continue;
      for (const finding of rules[id].check({ diagram, model })) diagnostics.push({ ...finding, ruleId: id, severity, canvasId: diagram.id, line: diagram.line });
    }
  }
  return diagnostics;
}

export function projectDiagram(diagram: ParsedDiagram, declared?: Model): Omit<PortableDiagram, 'defaultLayout'> {
  const recipe = recipes[declared?.recipe ?? 'standard'];
  const vocabulary = { ...recipe?.vocabulary, ...declared?.vocabulary };
  const presentation = { ...recipe?.presentation, ...declared?.presentation };
  return {
    id: diagram.id,
    mode: diagram.mode,
    graph: { ...diagram.graph, nodes: diagram.graph.nodes.map(n => ({ ...n, classes: n.kind ? [presentation[n.kind], ...n.classes.filter(c => c !== presentation[n.kind!])] : n.classes })) },
    settings: diagram.settings ? { title: diagram.settings.title, scrollZoom: diagram.settings.scrollZoom, layout: diagram.settings.layout, legend: diagram.settings.legend ? {
      entries: diagram.settings.legend.entries.map(e => 'kind' in e ? { class: presentation[e.kind], kind: e.kind, label: e.label ?? vocabulary[e.kind].label } : e),
    } : undefined } : undefined,
  };
}
export function formatDiagnostic(d: Diagnostic, filename: string): string {
  return `${filename}${d.line ? `:${d.line}` : ''}: ${d.severity.toUpperCase()} ${d.ruleId}${d.canvasId ? ` [${d.canvasId}]` : ''}${d.elementIds?.length ? ` (${d.elementIds.join(', ')})` : ''}: ${d.message}${d.suggestion ? ` ${d.suggestion}` : ''}`;
}
