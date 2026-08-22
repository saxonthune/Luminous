import type { AtlasData } from './data.ts';
import type { AtlasDocument } from './types.ts';
import { edgeAllowed } from './operations.ts';

export interface AtlasCheckIssue {
  severity: 'error' | 'warning';
  message: string;
}

export function checkAtlasDocument(doc: AtlasDocument, data?: AtlasData): AtlasCheckIssue[] {
  const issues: AtlasCheckIssue[] = [];

  const siblingsByParent = new Map<string | undefined, string[]>();
  for (const node of doc.nodes) {
    const list = siblingsByParent.get(node.parent) ?? [];
    list.push(node.name);
    siblingsByParent.set(node.parent, list);
  }
  for (const names of siblingsByParent.values()) {
    const seen = new Map<string, number>();
    for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);
    for (const [name, count] of seen) {
      if (count > 1) {
        issues.push({ severity: 'warning', message: `duplicate node name "${name}" in the same container` });
      }
    }
  }

  const nodeIds = new Set(doc.nodes.map(n => n.id));
  const containerIds = new Set(doc.nodes.flatMap((node) => node.parent === undefined ? [] : [node.parent]));
  for (const node of doc.nodes) {
    if (node.ports !== undefined && !containerIds.has(node.id)) {
      issues.push({ severity: 'error', message: `node "${node.id}" is not a Container and cannot store Ports` });
    }
    for (const [kind, position] of Object.entries(node.ports ?? {})) {
      if ((kind !== 'entry' && kind !== 'exit') || !position
        || !['top', 'right', 'bottom', 'left'].includes(position.side)
        || !Number.isFinite(position.offset) || position.offset < 0 || position.offset > 1) {
        issues.push({ severity: 'error', message: `node "${node.id}" has an invalid ${kind} Port position` });
      }
    }
  }
  for (const edge of doc.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({ severity: 'error', message: `edge references unknown node id "${edge.from}"` });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({ severity: 'error', message: `edge references unknown node id "${edge.to}"` });
    }
    if (!edgeAllowed(doc, edge.from, edge.to)) {
      issues.push({
        severity: 'warning',
        message: `edge between "${edge.from}" and "${edge.to}": one contains the other, which containment already relates`,
      });
    }
  }

  if (data !== undefined) {
    const usedKeys = new Set<string>();
    for (const node of doc.nodes) {
      const key = node.content?.from;
      if (key === undefined) continue;
      usedKeys.add(key);
      if (data.entries[key] === undefined) {
        issues.push({
          severity: 'warning',
          message: `node "${node.id}" content names key "${key}", which the data file does not provide`,
        });
      }
    }
    for (const key of Object.keys(data.entries)) {
      if (!usedKeys.has(key)) {
        issues.push({
          severity: 'warning',
          message: `data file entry "${key}" is not named by any node's content`,
        });
      }
    }
  }

  return issues;
}
