import { parse } from 'pele';
import type { PortableGraph, PortableNode } from '../graph.js';

const plainLabel = (text: string) => text.replace(/<br\s*\/?\s*>/gi, '\n');

export function importMermaid(source: string): PortableGraph {
  const model = parse(source);
  if (model.type !== 'flowchart') throw new Error('Portable currently supports Mermaid flowcharts only.');
  const groups = new Set(model.subgraphs.map(group => group.id));
  const parents = new Map<string, string>();
  for (const group of model.subgraphs) {
    for (const id of group.nodes) parents.set(id, group.id);
  }
  const nodes: PortableNode[] = [
    ...model.subgraphs.map(group => ({ id: group.id, label: plainLabel(group.title), parentId: parents.get(group.id), group: true, direction: group.dir === 'LR' ? 'RIGHT' as const : group.dir ? 'DOWN' as const : undefined, classes: group.classes })),
    ...[...model.nodes.values()].filter(node => !groups.has(node.id)).map(node => ({ id: node.id, label: plainLabel(node.text ?? node.id), parentId: parents.get(node.id), group: false, classes: node.classes })),
  ];
  const ids = new Set(nodes.map(node => node.id));
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let parent = node.parentId;
    while (parent) {
      if (seen.has(parent)) throw new Error(`Cyclic containment at ${node.id}`);
      seen.add(parent);
      parent = parents.get(parent);
    }
  }
  const edges = model.edges.map((edge, index) => {
    if (!ids.has(edge.start) || !ids.has(edge.end)) throw new Error('Unknown edge endpoint');
    return { id: edge.id ?? `edge-${index}`, source: edge.start, target: edge.end, label: plainLabel(edge.text), invisible: edge.stroke === 'invisible', dashed: edge.stroke === 'dotted', arrow: edge.type?.includes('arrow_point') ?? false };
  });
  return { nodes, edges, direction: model.direction === 'LR' || model.direction === 'RL' ? 'RIGHT' : 'DOWN' };
}
