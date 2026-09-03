import type { MerinoDocument } from './types.ts';

export interface MerinoCheckIssue {
  severity: 'error' | 'warning';
  message: string;
}

/** Validate a Document. Errors are broken invariants an author should fix;
 * warnings are structural smells that never block a write. */
export function checkMerinoDocument(doc: MerinoDocument): MerinoCheckIssue[] {
  const issues: MerinoCheckIssue[] = [];

  const nodeTypeIds = new Set(doc.nodeTypes.map(t => t.id));
  const edgeTypeIds = new Set(doc.edgeTypes.map(t => t.id));
  const nodesById = new Map(doc.nodes.map(n => [n.id, n]));

  const seenOverviewRoots = new Set<string>();
  for (const id of doc.overview?.requirements?.rootNodeIds ?? []) {
    if (seenOverviewRoots.has(id)) issues.push({ severity: 'error', message: `duplicate requirements Overview root node id "${id}"` });
    seenOverviewRoots.add(id);
    const node = nodesById.get(id);
    if (!node) issues.push({ severity: 'error', message: `requirements Overview root references unknown node id "${id}"` });
    else if (node.tab !== 'requirements') issues.push({ severity: 'error', message: `requirements Overview root "${id}" is on ${node.tab}` });
  }

  const seenNodeTypes = new Set<string>();
  for (const t of doc.nodeTypes) {
    if (seenNodeTypes.has(t.id)) issues.push({ severity: 'error', message: `duplicate node type id "${t.id}"` });
    seenNodeTypes.add(t.id);
  }
  const seenEdgeTypes = new Set<string>();
  for (const t of doc.edgeTypes) {
    if (seenEdgeTypes.has(t.id)) issues.push({ severity: 'error', message: `duplicate edge type id "${t.id}"` });
    seenEdgeTypes.add(t.id);
  }
  const seenNodeIds = new Set<string>();
  for (const n of doc.nodes) {
    if (seenNodeIds.has(n.id)) issues.push({ severity: 'error', message: `duplicate node id "${n.id}"` });
    seenNodeIds.add(n.id);
  }
  const seenEdgeIds = new Set<string>();
  for (const e of doc.edges) {
    if (seenEdgeIds.has(e.id)) issues.push({ severity: 'error', message: `duplicate edge id "${e.id}"` });
    seenEdgeIds.add(e.id);
  }

  for (const node of doc.nodes) {
    if (!nodeTypeIds.has(node.type)) {
      issues.push({ severity: 'error', message: `node "${node.id}" has type "${node.type}", which is not in the registry` });
    }
    if (node.parent !== undefined) {
      const parent = nodesById.get(node.parent);
      if (parent === undefined) {
        issues.push({ severity: 'error', message: `node "${node.id}" parent references unknown node id "${node.parent}"` });
      } else if (parent.tab !== node.tab) {
        issues.push({ severity: 'error', message: `Subnode "${node.id}" is on ${node.tab} but its parent "${parent.id}" is on ${parent.tab}` });
      }
    }
  }

  // Parent cycles.
  const reported = new Set<string>();
  for (const node of doc.nodes) {
    const visited = new Set<string>();
    let current = nodesById.get(node.id);
    while (current !== undefined) {
      if (visited.has(current.id)) {
        if (!reported.has(current.id)) {
          reported.add(current.id);
          issues.push({ severity: 'error', message: `node parent cycle through "${current.id}"` });
        }
        break;
      }
      visited.add(current.id);
      current = current.parent !== undefined ? nodesById.get(current.parent) : undefined;
    }
  }

  for (const edge of doc.edges) {
    if (!edgeTypeIds.has(edge.type)) {
      issues.push({ severity: 'error', message: `edge "${edge.id}" has type "${edge.type}", which is not in the registry` });
    }
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (from === undefined) {
      issues.push({ severity: 'error', message: `edge "${edge.id}" names missing node "${edge.from}"` });
    }
    if (to === undefined) {
      issues.push({ severity: 'error', message: `edge "${edge.id}" names missing node "${edge.to}"` });
    }
    // No cross-screen edges: the Edge and both endpoints share one Tab.
    if (from !== undefined && from.tab !== edge.tab) {
      issues.push({ severity: 'error', message: `edge "${edge.id}" is on ${edge.tab} but its source "${from.id}" is on ${from.tab}` });
    }
    if (to !== undefined && to.tab !== edge.tab) {
      issues.push({ severity: 'error', message: `edge "${edge.id}" is on ${edge.tab} but its target "${to.id}" is on ${to.tab}` });
    }
  }

  // Smells — never block a write.
  const usedNodeTypes = new Set(doc.nodes.map(n => n.type));
  for (const t of doc.nodeTypes) {
    if (!usedNodeTypes.has(t.id)) {
      issues.push({ severity: 'warning', message: `node type "${t.id}" is defined but unused` });
    }
  }
  const usedEdgeTypes = new Set(doc.edges.map(e => e.type));
  for (const t of doc.edgeTypes) {
    if (!usedEdgeTypes.has(t.id)) {
      issues.push({ severity: 'warning', message: `edge type "${t.id}" is defined but unused` });
    }
  }

  return issues;
}
