import type { PortableCard, PortableGraph } from '../graph.js';
import { applyNodeContent } from './node-content.js';

/** Reuse the schema Card contract without requiring a diagram or node ID. */
export function parseSchemaBlock(value: unknown): PortableCard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('portable-schema needs a title and fields');
  const graph: PortableGraph = { direction: 'DOWN', nodes: [{ id: 'schema', label: '', group: false, classes: [] }], edges: [] };
  applyNodeContent(graph, { schema: { component: 'schema-card', ...value } });
  const card = graph.nodes[0].card!;
  function check(content: PortableCard) {
    if (content.component !== 'schema-card' || content.info) throw new Error('portable-schema supports schema definitions and source footers, not canvas info panels');
    for (const field of content.fields ?? []) if (field.schema) check(field.schema);
  }
  check(card);
  return card;
}
