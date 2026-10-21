import type { DenimGraph, DenimNode } from './database.ts';

export type SequenceListEntry = { node: DenimNode; edgeId: string; parentId: string; depth: number; orderLabel: string };

export function sequenceDescendantEntries(graph: DenimGraph, ownerNodeId: string): SequenceListEntry[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, typeof graph.edges>();
  const edgeOrder = new Map(graph.edges.map((edge, index) => [edge.id, index]));
  for (const edge of graph.edges) {
    if (edge.type !== 'parent-child') continue;
    const children = childrenByParent.get(edge.sourceId) ?? [];
    children.push(edge);
    childrenByParent.set(edge.sourceId, children);
  }
  const alpha = (value: number) => {
    let current = value;
    let label = '';
    while (current > 0) {
      current--;
      label = String.fromCharCode(97 + current % 26) + label;
      current = Math.floor(current / 26);
    }
    return label;
  };
  const roman = (value: number) => {
    const numerals: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let current = value;
    let label = '';
    for (const [amount, symbol] of numerals) while (current >= amount) { label += symbol; current -= amount; }
    return label || String(value);
  };
  const output: SequenceListEntry[] = [];
  const visited = new Set<string>([ownerNodeId]);
  const visit = (parentId: string, path: number[]) => {
    const edges = [...(childrenByParent.get(parentId) ?? [])].sort((a, b) => {
      if (a.priority != null && b.priority != null) return a.priority - b.priority || a.targetId.localeCompare(b.targetId);
      if (a.priority != null) return -1;
      if (b.priority != null) return 1;
      return (edgeOrder.get(a.id) ?? 0) - (edgeOrder.get(b.id) ?? 0);
    });
    edges.forEach((edge, index) => {
      const node = nodeById.get(edge.targetId);
      if (!node || visited.has(node.id)) return;
      visited.add(node.id);
      const nextPath = [...path, index + 1];
      const label = nextPath.map((rank, depth) => depth === 0 ? String(rank)
        : depth === 1 ? alpha(rank) : depth === 2 ? roman(rank) : String(rank))
        .reduce((result, segment, depth) => depth === 0 ? segment : `${result}${depth === 1 ? '' : '-'}${segment}`, '');
      output.push({ node, edgeId: edge.id, parentId, depth: nextPath.length - 1, orderLabel: label });
      visit(node.id, nextPath);
    });
  };
  visit(ownerNodeId, []);
  return output;
}

