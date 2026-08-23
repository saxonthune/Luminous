import { endpointKind } from './operations.ts';
import type { LinenContract, LinenDocument, LinenEdge, LinenTraceNode } from './types.ts';

/** A control Edge joins two Trace Nodes; every other legal Edge is an Edge to
 * a Contract. */
export function isControlEdge(doc: LinenDocument, edge: LinenEdge): boolean {
  return endpointKind(doc, edge.from) === 'node' && endpointKind(doc, edge.to) === 'node';
}

/** The Trace from `entryId`: a depth-first pre-order walk over control Edges
 * in edge-array order. Order is derived here, never stored (epic decision 2).
 * Returns [] when `entryId` is not a Trace Node. */
export function traceFrom(doc: LinenDocument, entryId: string): LinenTraceNode[] {
  const byId = new Map(doc.nodes.map(n => [n.id, n]));
  const start = byId.get(entryId);
  if (start === undefined) return [];
  const controlOut = new Map<string, string[]>();
  for (const edge of doc.edges) {
    if (!isControlEdge(doc, edge)) continue;
    const list = controlOut.get(edge.from) ?? [];
    list.push(edge.to);
    controlOut.set(edge.from, list);
  }
  const order: LinenTraceNode[] = [];
  const visited = new Set<string>();
  const stack = [entryId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(byId.get(id)!);
    const next = controlOut.get(id) ?? [];
    for (let i = next.length - 1; i >= 0; i--) {
      stack.push(next[i]);
    }
  }
  return order;
}

/** The return rule: the format a Trace resumes with after a Pass is the
 * Contract connected (by an Edge) to the Module passed to. Derived, never
 * stored. Returns undefined when the node is not a Pass or no Contract is
 * connected. */
export function resumeContract(doc: LinenDocument, passNodeId: string): LinenContract | undefined {
  const node = doc.nodes.find(n => n.id === passNodeId);
  if (node === undefined || node.kind !== 'pass') return undefined;
  const contractsById = new Map(doc.contracts.map(c => [c.id, c]));
  for (const edge of doc.edges) {
    if (edge.from !== node.to) continue;
    const contract = contractsById.get(edge.to);
    if (contract !== undefined) return contract;
  }
  return undefined;
}

export interface ModuleManifest {
  module: string;
  /** Edges leaving the Module subtree (the Module, its descendant Modules, and
   * their Trace Nodes). */
  outbound: LinenEdge[];
  /** Contract ids among the outbound targets, plus Contracts connected to the
   * Module itself. */
  contracts: string[];
  /** Pass nodes inside the subtree whose target Module is outside it, with the
   * derived resume Contract where one is connected. */
  passes: { node: string; to: string; resumeContract?: string }[];
}

/** The Manifest computed at a Module border: what leaves, in what formats.
 * Computed, never authored (glossary: Manifest). */
export function moduleManifest(doc: LinenDocument, moduleId: string): ModuleManifest {
  const subtree = new Set<string>([moduleId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const module of doc.modules) {
      if (module.parent !== undefined && subtree.has(module.parent) && !subtree.has(module.id)) {
        subtree.add(module.id);
        grew = true;
      }
    }
  }
  const inside = new Set<string>(subtree);
  for (const node of doc.nodes) {
    if (subtree.has(node.module)) inside.add(node.id);
  }

  const outbound = doc.edges.filter(e => inside.has(e.from) && !inside.has(e.to));
  const contractIds = new Set(doc.contracts.map(c => c.id));
  const contracts: string[] = [];
  for (const edge of outbound) {
    if (contractIds.has(edge.to) && !contracts.includes(edge.to)) contracts.push(edge.to);
  }

  const passes: ModuleManifest['passes'] = [];
  for (const node of doc.nodes) {
    if (node.kind !== 'pass' || !inside.has(node.id) || subtree.has(node.to)) continue;
    const resume = resumeContract(doc, node.id);
    const entry: ModuleManifest['passes'][number] = { node: node.id, to: node.to };
    if (resume !== undefined) entry.resumeContract = resume.id;
    passes.push(entry);
  }

  return { module: moduleId, outbound, contracts, passes };
}
