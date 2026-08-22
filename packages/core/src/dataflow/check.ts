import type { DataflowDocument } from './types.ts';

export interface CheckIssue {
  severity: 'error' | 'warning';
  message: string;
  boxId?: string;
}

export function checkDocument(doc: DataflowDocument): CheckIssue[] {
  const issues: CheckIssue[] = [];

  const boxIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const box of doc.boxes) {
    if (boxIds.has(box.id)) duplicateIds.add(box.id);
    boxIds.add(box.id);
  }
  for (const id of duplicateIds) {
    issues.push({ severity: 'error', message: `duplicate box id "${id}"`, boxId: id });
  }

  const namesSeen = new Map<string, number>();
  for (const box of doc.boxes) {
    namesSeen.set(box.name, (namesSeen.get(box.name) ?? 0) + 1);
  }
  for (const box of doc.boxes) {
    if ((namesSeen.get(box.name) ?? 0) > 1) {
      issues.push({ severity: 'error', message: `duplicate box name "${box.name}"`, boxId: box.id });
    }
  }

  for (const flow of doc.flows) {
    if (!boxIds.has(flow.from)) {
      issues.push({ severity: 'error', message: `flow references unknown box id "${flow.from}"` });
    }
    if (!boxIds.has(flow.to)) {
      issues.push({ severity: 'error', message: `flow references unknown box id "${flow.to}"` });
    }
  }

  const inbound = new Set<string>();
  const outbound = new Set<string>();
  for (const flow of doc.flows) {
    outbound.add(flow.from);
    inbound.add(flow.to);
  }

  for (const box of doc.boxes) {
    const hasInbound = inbound.has(box.id);
    const hasOutbound = outbound.has(box.id);
    if (!hasInbound && !hasOutbound) {
      issues.push({ severity: 'warning', message: `box "${box.name}" has no flows`, boxId: box.id });
    } else if (hasInbound && !hasOutbound) {
      issues.push({ severity: 'warning', message: `box "${box.name}" has inbound flows but no outbound flow`, boxId: box.id });
    }
  }

  return issues;
}
