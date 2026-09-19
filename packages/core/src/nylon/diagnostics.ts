import type { NylonArc, NylonDocument } from './types.ts';

export interface NylonFinding {
  message: string;
  nodeIds: string[];
  arcIds?: string[];
}

export interface NylonDiagnostic extends NylonFinding {
  rule: string;
  severity: 'warning' | 'error';
  arcIds: string[];
  id?: string;
}

export interface NylonRule {
  id: string;
  description: string;
  severity: NylonDiagnostic['severity'];
  check: (context: NylonRuleContext) => NylonFinding[];
}

export const nylonArcId = (arc: NylonArc, index: number): string => arc.id ?? `${arc.from}->${arc.to}-${index}`;

/** Shared indexes are built once per check. No rendering, storage, or UI dependencies. */
function ruleContext(doc: NylonDocument) {
  const nodes = [...doc.transformations, ...doc.contracts];
  return {
    doc, nodes,
    nodeIds: new Set(nodes.map((node) => node.id)),
    transformations: new Map(doc.transformations.map((node) => [node.id, node])),
    contracts: new Map(doc.contracts.map((node) => [node.id, node])),
    parents: new Set(nodes.flatMap((node) => node.parent === undefined ? [] : [node.parent])),
    pairs: [
      ...doc.transformations.flatMap((node) => node.contractPair ? [{ pair: node.contractPair, label: `Transformation "${node.id}"`, nodeIds: [node.id], arcIds: [] as string[] }] : []),
      ...doc.arcs.flatMap((arc, index) => arc.controlContract ? [{ pair: arc.controlContract, label: `Arc "${nylonArcId(arc, index)}"`, nodeIds: [arc.from, arc.to], arcIds: [nylonArcId(arc, index)] }] : []),
    ],
  };
}
export type NylonRuleContext = ReturnType<typeof ruleContext>;

const finding = (message: string, nodeIds: string[], arcIds: string[] = []): NylonFinding => ({ message, nodeIds, arcIds });

/** Most Arc rules return messages; attach the same endpoint identities consistently. */
function arcRule(id: string, description: string, check: (arc: NylonArc, context: NylonRuleContext) => string[]): NylonRule {
  return { id, description, severity: 'warning', check: (context) => context.doc.arcs.flatMap((arc, index) =>
    check(arc, context).map((message) => finding(message, [arc.from, arc.to], [nylonArcId(arc, index)]))) };
}

/** Nylon-wide rule catalog. Add a named entry here when its vocabulary grows.
 * Each entry owns its predicate, explanation, and severity. Consumers only display
 * diagnostics or reject structural errors; they must not reimplement predicates.
 */
export const nylonRules: readonly NylonRule[] = [
  {
    id: 'duplicate-node-id', description: 'Node identities must be unique.', severity: 'error',
    check: ({ nodes }) => {
      const seen = new Set<string>();
      return nodes.flatMap((node) => {
        if (seen.has(node.id)) return [finding(`duplicate id "${node.id}"`, [node.id])];
        seen.add(node.id); return [];
      });
    },
  },
  {
    id: 'duplicate-arc-id', description: 'Explicit Arc identities must be unique.', severity: 'error',
    check: ({ doc }) => {
      const seen = new Set<string>();
      return doc.arcs.flatMap((arc) => {
        if (!arc.id) return [];
        if (seen.has(arc.id)) return [finding(`duplicate Arc id "${arc.id}"`, [arc.from, arc.to], [arc.id])];
        seen.add(arc.id); return [];
      });
    },
  },
  {
    id: 'unknown-parent', description: 'A parent must identify an existing Transformation.', severity: 'error',
    check: ({ nodes, transformations }) => nodes.flatMap((node) => node.parent !== undefined && !transformations.has(node.parent)
      ? [finding(`item "${node.id}" has unknown parent Transformation "${node.parent}"`, [node.id])] : []),
  },
  {
    id: 'parent-cycle', description: 'Containment must not contain cycles.', severity: 'error',
    check: ({ nodes, transformations }) => nodes.flatMap((node) => {
      const seen = new Set<string>();
      let id: string | undefined = node.id;
      while (id !== undefined) {
        if (seen.has(id)) return [finding(`parent cycle through Transformation "${id}"`, [...seen])];
        seen.add(id); id = transformations.get(id)?.parent;
      }
      return [];
    }),
  },
  {
    id: 'contract-reference', description: 'Pair halves must identify existing Contracts.', severity: 'warning',
    check: ({ pairs, contracts }) => pairs.flatMap(({ pair, label, nodeIds, arcIds }) =>
      [['Input', pair.input], ['Output', pair.output]].flatMap(([role, id]) => !contracts.has(id)
        ? [finding(`${label} has unknown ${role} Contract "${id}"`, [...nodeIds, id], arcIds)] : [])),
  },
  {
    id: 'distinct-contracts', description: 'Input and output must be separate Contract Nodes.', severity: 'warning',
    check: ({ pairs }) => pairs.flatMap(({ pair, label, nodeIds, arcIds }) => pair.input === pair.output
      ? [finding(`${label} must use distinct Input and Output Contracts`, [...nodeIds, pair.input], arcIds)] : []),
  },
  {
    id: 'contract-space', description: 'Pair halves must share a coordinate space.', severity: 'warning',
    check: ({ pairs, contracts }) => pairs.flatMap(({ pair, label, nodeIds, arcIds }) => {
      const input = contracts.get(pair.input), output = contracts.get(pair.output);
      return input && output && input.parent !== output.parent
        ? [finding(`${label} has Contract Pair halves in different coordinate spaces`, [...nodeIds, pair.input, pair.output], arcIds)] : [];
    }),
  },
  {
    id: 'duplicate-arc', description: 'Arcs without explicit identity must not duplicate the same kind and endpoints.', severity: 'warning',
    check: ({ doc }) => {
      const seen = new Set<string>();
      return doc.arcs.flatMap((arc, index) => {
        if (arc.id) return []; // Explicit identity collisions have their own structural rule.
        const key = `${arc.kind ?? 'data'}:${arc.from}\0${arc.to}`;
        if (seen.has(key)) return [finding(`duplicate Arc "${arc.from}" -> "${arc.to}"`, [arc.from, arc.to], [nylonArcId(arc, index)])];
        seen.add(key); return [];
      });
    },
  },
  arcRule('arc-endpoint', 'Arc endpoints must identify existing Nodes.', (arc, { nodeIds }) =>
    [arc.from, arc.to].filter((id) => !nodeIds.has(id)).map((id) => `Arc references unknown id "${id}"`)),
  arcRule('control-identity', 'Control Arcs need stable identities.', (arc) =>
    arc.kind === 'control' && !arc.id ? ['Control Arc needs a stable id'] : []),
  arcRule('control-endpoints', 'Control Arcs connect Transformations.', (arc, { nodeIds, transformations }) =>
    arc.kind === 'control' && [arc.from, arc.to].some((id) => nodeIds.has(id) && !transformations.has(id))
      ? ['Control Arc must connect Transformations'] : []),
  arcRule('control-role', 'Control Arcs state how control progresses.', (arc) =>
    arc.kind === 'control' && !arc.control ? ['State whether control invokes, returns, or continues'] : []),
  arcRule('control-contract-role', 'Only invocations own Control Contracts.', (arc) =>
    arc.kind === 'control' && arc.controlContract && arc.control !== 'invoke' ? ['A Control Contract describes an invocation'] : []),
  arcRule('return-invocation', 'Returns identify the invocation they complete.', (arc, { doc }) =>
    arc.kind === 'control' && arc.control === 'return'
      && (!arc.invocation || !doc.arcs.some((candidate) => candidate.id === arc.invocation && candidate.kind === 'control' && candidate.control === 'invoke'))
      ? ['Return must identify its invocation Arc'] : []),
  arcRule('invocation-reference-role', 'Only returns reference an invocation.', (arc) =>
    arc.kind === 'control' && arc.control !== 'return' && arc.invocation ? ['Only a return references an invocation'] : []),
  arcRule('data-alternation', 'Data Arcs connect a Contract and a Transformation.', (arc, { nodeIds, transformations }) =>
    arc.kind !== 'control' && nodeIds.has(arc.from) && nodeIds.has(arc.to) && transformations.has(arc.from) === transformations.has(arc.to)
      ? [`Arc "${arc.from}" -> "${arc.to}" breaks Contract–Transformation alternation`] : []),
  arcRule('data-parent-endpoint', 'Data Arcs attach to internal participants of differentiated Transformations.', (arc, { parents }) =>
    arc.kind !== 'control' ? [arc.from, arc.to].filter((id) => parents.has(id)).map((id) => `Parent Transformation "${id}" cannot be an Arc endpoint`) : []),
  arcRule('data-control-fields', 'Control metadata belongs only on Control Arcs.', (arc) =>
    arc.kind !== 'control' && (arc.control || arc.controlContract || arc.invocation) ? ['Control fields require a control Arc'] : []),
];

/** Pure evaluation of the same Nylon-wide catalog for JSON, UI, CLI, and actions. */
export function checkNylonDocument(doc: NylonDocument, rules: readonly NylonRule[] = nylonRules): NylonDiagnostic[] {
  const context = ruleContext(doc);
  return rules.flatMap((rule) => rule.check(context).map((item) => ({
    ...item, nodeIds: [...new Set(item.nodeIds)], arcIds: item.arcIds ?? [],
    rule: rule.id, severity: rule.severity, id: item.nodeIds[0],
  })));
}
