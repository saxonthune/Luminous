import type { AtlasDocument } from './types.ts';

export interface AtlasCheckIssue {
  severity: 'error' | 'warning';
  message: string;
}

export function checkAtlasDocument(doc: AtlasDocument): AtlasCheckIssue[] {
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
  for (const edge of doc.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({ severity: 'error', message: `edge references unknown node id "${edge.from}"` });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({ severity: 'error', message: `edge references unknown node id "${edge.to}"` });
    }
  }

  return issues;
}
