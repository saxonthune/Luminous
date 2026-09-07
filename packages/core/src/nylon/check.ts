import type { NylonDocument } from './types.ts';

export interface NylonCheckIssue {
  severity: 'error' | 'warning';
  message: string;
  id?: string;
}

export function checkNylonDocument(doc: NylonDocument): NylonCheckIssue[] {
  const issues: NylonCheckIssue[] = [];
  const kinds = new Map<string, 'transformation' | 'contract'>();

  for (const transformation of doc.transformations) {
    if (kinds.has(transformation.id)) {
      issues.push({ severity: 'error', message: `duplicate id "${transformation.id}"`, id: transformation.id });
    } else {
      kinds.set(transformation.id, 'transformation');
    }
  }
  for (const contract of doc.contracts) {
    if (kinds.has(contract.id)) {
      issues.push({ severity: 'error', message: `duplicate id "${contract.id}"`, id: contract.id });
    } else {
      kinds.set(contract.id, 'contract');
    }
  }

  const transformations = new Map(doc.transformations.map((item) => [item.id, item]));
  const contractIds = new Set(doc.contracts.map((item) => item.id));
  for (const transformation of doc.transformations) {
    const pair = transformation.contractPair;
    if (!pair) continue;
    if (!contractIds.has(pair.input)) {
      issues.push({
        severity: 'error',
        message: `Transformation "${transformation.id}" has unknown Input Contract "${pair.input}"`,
        id: transformation.id,
      });
    }
    if (!contractIds.has(pair.output)) {
      issues.push({
        severity: 'error',
        message: `Transformation "${transformation.id}" has unknown Output Contract "${pair.output}"`,
        id: transformation.id,
      });
    }
    if (pair.input === pair.output) {
      issues.push({
        severity: 'error',
        message: `Transformation "${transformation.id}" must use distinct Input and Output Contracts`,
        id: transformation.id,
      });
    }
    const input = doc.contracts.find((contract) => contract.id === pair.input);
    const output = doc.contracts.find((contract) => contract.id === pair.output);
    if (input && output && input.parent !== output.parent) {
      issues.push({
        severity: 'error',
        message: `Transformation "${transformation.id}" has Contract Pair halves in different coordinate spaces`,
        id: transformation.id,
      });
    }
  }
  for (const item of [...doc.transformations, ...doc.contracts]) {
    if (item.parent !== undefined && !transformations.has(item.parent)) {
      issues.push({ severity: 'error', message: `item "${item.id}" has unknown parent Transformation "${item.parent}"`, id: item.id });
    }
  }

  for (const transformation of doc.transformations) {
    const visited = new Set<string>();
    let current: string | undefined = transformation.id;
    while (current !== undefined) {
      if (visited.has(current)) {
        issues.push({ severity: 'error', message: `parent cycle through Transformation "${current}"`, id: current });
        break;
      }
      visited.add(current);
      current = transformations.get(current)?.parent;
    }
  }

  const parentIds = new Set(
    [...doc.transformations, ...doc.contracts]
      .map((item) => item.parent)
      .filter((id): id is string => id !== undefined),
  );
  const arcs = new Set<string>();
  for (const arc of doc.arcs) {
    const key = `${arc.from}\0${arc.to}`;
    if (arcs.has(key)) {
      issues.push({ severity: 'error', message: `duplicate Arc "${arc.from}" -> "${arc.to}"` });
    }
    arcs.add(key);
    const fromKind = kinds.get(arc.from);
    const toKind = kinds.get(arc.to);
    if (fromKind === undefined) {
      issues.push({ severity: 'error', message: `Arc references unknown id "${arc.from}"`, id: arc.from });
    }
    if (toKind === undefined) {
      issues.push({ severity: 'error', message: `Arc references unknown id "${arc.to}"`, id: arc.to });
    }
    if (fromKind !== undefined && toKind !== undefined && fromKind === toKind) {
      issues.push({ severity: 'error', message: `Arc "${arc.from}" -> "${arc.to}" breaks Contract–Transformation alternation` });
    }
    if (parentIds.has(arc.from) || parentIds.has(arc.to)) {
      const id = parentIds.has(arc.from) ? arc.from : arc.to;
      issues.push({ severity: 'error', message: `Parent Transformation "${id}" cannot be an Arc endpoint`, id });
    }
  }

  return issues;
}
