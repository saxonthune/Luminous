import { kindDescriptor } from './kind-descriptors.ts';
import type { KindRules } from './kind-descriptors.ts';
import { isControlEdge, resumeContract } from './derive.ts';
import { endpointKind } from './operations.ts';
import type { LinenDocument, LinenTraceNode } from './types.ts';

export interface LinenCheckIssue {
  severity: 'error' | 'warning';
  message: string;
}

function rulesOf(node: LinenTraceNode): KindRules {
  return kindDescriptor(node.kind).rules;
}

export function checkLinenDocument(doc: LinenDocument): LinenCheckIssue[] {
  const issues: LinenCheckIssue[] = [];

  const moduleIds = new Set(doc.modules.map(m => m.id));
  const modulesById = new Map(doc.modules.map(m => [m.id, m]));
  for (const module of doc.modules) {
    if (module.parent !== undefined && !moduleIds.has(module.parent)) {
      issues.push({ severity: 'error', message: `module "${module.id}" parent references unknown module id "${module.parent}"` });
    }
  }
  const reportedCycle = new Set<string>();
  for (const module of doc.modules) {
    const visited = new Set<string>();
    let current = modulesById.get(module.id);
    while (current !== undefined) {
      if (visited.has(current.id)) {
        if (!reportedCycle.has(current.id)) {
          reportedCycle.add(current.id);
          issues.push({ severity: 'error', message: `module parent cycle through "${current.id}"` });
        }
        break;
      }
      visited.add(current.id);
      current = current.parent !== undefined ? modulesById.get(current.parent) : undefined;
    }
  }

  const contractIds = new Set(doc.contracts.map(c => c.id));
  for (const contract of doc.contracts) {
    if (contract.owner !== undefined && !moduleIds.has(contract.owner)) {
      issues.push({ severity: 'error', message: `contract "${contract.id}" owner references unknown module id "${contract.owner}"` });
    }
  }

  for (const node of doc.nodes) {
    if (!moduleIds.has(node.module)) {
      issues.push({ severity: 'error', message: `node "${node.id}" module references unknown module id "${node.module}"` });
    }
    if (node.kind === 'type' && node.contract !== undefined && !contractIds.has(node.contract)) {
      issues.push({ severity: 'error', message: `node "${node.id}" contract references unknown contract id "${node.contract}"` });
    }
  }

  for (const edge of doc.edges) {
    const fromKind = endpointKind(doc, edge.from);
    const toKind = endpointKind(doc, edge.to);
    if (fromKind === undefined) {
      issues.push({ severity: 'error', message: `edge references unknown id "${edge.from}"` });
    }
    if (toKind === undefined) {
      issues.push({ severity: 'error', message: `edge references unknown id "${edge.to}"` });
    }
    if (fromKind === undefined || toKind === undefined) continue;
    const control = fromKind === 'node' && toKind === 'node';
    const toContract = (fromKind === 'node' || fromKind === 'module') && toKind === 'contract';
    if (!control && !toContract) {
      issues.push({
        severity: 'error',
        message: `edge "${edge.from}" -> "${edge.to}" joins a ${fromKind} to a ${toKind}: an Edge joins two Trace Nodes, or a Trace Node or Module to a Contract`,
      });
    }
  }

  // Structural rules read from the descriptor table (epic decision 3) — no
  // per-kind branches here.
  const nodesById = new Map(doc.nodes.map(n => [n.id, n]));
  const controlIn = new Map<string, number>();
  const controlOut = new Map<string, string[]>();
  for (const edge of doc.edges) {
    if (!isControlEdge(doc, edge)) continue;
    controlIn.set(edge.to, (controlIn.get(edge.to) ?? 0) + 1);
    const list = controlOut.get(edge.from) ?? [];
    list.push(edge.to);
    controlOut.set(edge.from, list);
  }

  for (const node of doc.nodes) {
    const rules = rulesOf(node);
    const term = kindDescriptor(node.kind).term;
    const inCount = controlIn.get(node.id) ?? 0;
    const out = controlOut.get(node.id) ?? [];
    if (rules.maxIn !== undefined && inCount > rules.maxIn) {
      issues.push({
        severity: 'error',
        message: `${term} "${node.id}" has ${inCount} incoming control Edges (at most ${rules.maxIn})`,
      });
    }
    if (rules.terminates === true && out.length > 0) {
      issues.push({
        severity: 'error',
        message: `${term} "${node.id}" terminates the Trace but has an outgoing control Edge`,
      });
    }
    if (rules.continuingExits !== undefined) {
      const continuing = out.filter(to => {
        const target = nodesById.get(to);
        return target !== undefined && rulesOf(target).terminates !== true;
      });
      if (continuing.length !== rules.continuingExits) {
        issues.push({
          severity: 'error',
          message: `${term} "${node.id}" has ${continuing.length} continuing exits (exactly ${rules.continuingExits}); other exits must target terminating nodes`,
        });
      }
    }
    if (rules.requiresTarget === true && node.kind === 'pass') {
      if (!moduleIds.has(node.to)) {
        issues.push({ severity: 'error', message: `${term} "${node.id}" targets unknown module id "${node.to}"` });
      } else if (resumeContract(doc, node.id) === undefined) {
        issues.push({
          severity: 'warning',
          message: `${term} "${node.id}" targets module "${node.to}", which has no Contract connected: the resume format cannot be derived`,
        });
      }
    }
  }

  const startIds = doc.nodes.filter(n => rulesOf(n).maxIn === 0).map(n => n.id);
  const reachable = new Set<string>(startIds);
  const stack = [...startIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const to of controlOut.get(id) ?? []) {
      if (!reachable.has(to)) {
        reachable.add(to);
        stack.push(to);
      }
    }
  }
  for (const node of doc.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({ severity: 'warning', message: `node "${node.id}" is unreachable from any Entry` });
    }
  }

  return issues;
}
