import { isDiffKind } from '../diff.js';
import { isHttpMethod } from '../rest.js';
import type { PortableGraph } from '../graph.js';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Declarative content only: executable components remain registered in the bundle. */
export function applyNodeContent(graph: PortableGraph, content: unknown): void {
  if (!object(content)) throw new Error('portable-nodes must be a mapping of node IDs to cards');
  for (const [id, card] of Object.entries(content)) {
    const node = graph.nodes.find(node => node.id === id);
    if (!node || node.group) throw new Error(`portable-nodes: ${id} must name a non-container node`);
    if (!object(card) || !['card', 'rest-card', 'transition', 'usage-card', 'schema-card'].includes(String(card.component)) || typeof card.title !== 'string') {
      throw new Error(`portable-nodes: ${id} needs component: card, rest-card, transition or usage-card and a string title`);
    }
    if (card.component === 'transition' && Object.keys(card).some(key => !['component', 'title'].includes(key))) throw new Error(`Transition ${id} accepts only component and title`);
    if (Object.keys(card).some(key => !['component', 'title', 'body', 'footer', 'diff', 'info', 'badges', 'modifiers', ...(card.component === 'rest-card' ? ['methods'] : []), ...(card.component === 'usage-card' ? ['usage'] : []), ...(card.component === 'schema-card' ? ['fields', 'description', 'schemaKey'] : [])].includes(key))) throw new Error(`Unknown card field on ${id}`);
    if (card.component === 'schema-card') {
      if (card.description !== undefined && (typeof card.description !== 'string' || !card.description.trim())) throw new Error(`Invalid schema description on ${id}`);
      if (card.schemaKey !== undefined && (typeof card.schemaKey !== 'string' || !card.schemaKey.trim())) throw new Error(`Invalid schemaKey on ${id}`);
      const kinds = ['identifier', 'number', 'text', 'object', 'collection', 'choice', 'reference'];
      if (!Array.isArray(card.fields) || card.fields.some(row => !object(row) || typeof row.name !== 'string' || !row.name.trim() || typeof row.type !== 'string' || !row.type.trim() || !kinds.includes(String(row.kind)) || (row.optional !== undefined && typeof row.optional !== 'boolean') || (row.diff !== undefined && !isDiffKind(row.diff)) || Object.keys(row).some(key => !['name', 'type', 'kind', 'optional', 'diff', 'schema'].includes(key)))) throw new Error(`Invalid schema fields on ${id}`);
      if (new Set(card.fields.map(row => row.name)).size !== card.fields.length || card.body !== undefined) throw new Error(`Invalid schema-card ${id}: fields must be unique and replace body`);
      for (const row of card.fields) if (/[\w\]>)]+\s*\[\s*[^\]\s][^\]]*\]/.test(row.type)) throw new Error(`Schema field ${id}.${row.name}: indexed-access type labels are not allowed; name and define the referenced shape instead`);
      for (const row of card.fields) if (row.schema !== undefined) {
        const nested: PortableGraph = { nodes: [{ id: 'nested', label: '', group: false, classes: [] }], edges: [], direction: 'DOWN' };
        applyNodeContent(nested, { nested: row.schema });
        if (nested.nodes[0].card?.component !== 'schema-card') throw new Error(`Nested schema on ${id}.${row.name} must be a schema-card`);
      }
    }
    if (card.component === 'rest-card' && (!Array.isArray(card.methods) || !card.methods.every(isHttpMethod) || new Set(card.methods).size !== card.methods.length)) {
      throw new Error(`Invalid methods on ${id}: rest-card needs a unique list of uppercase HTTP methods (empty for prefixes)`);
    }
    if (card.component === 'usage-card') {
      if (!object(card.usage) || Object.keys(card.usage).some(key => !['uiRoute', 'startup', 'capabilities'].includes(key))) throw new Error(`Invalid usage sections on ${id}`);
      const route = card.usage.uiRoute;
      if (!object(route) || !Array.isArray(route.paths) || !route.paths.length || route.paths.some(path => typeof path !== 'string' || !path.startsWith('/')) || typeof route.context !== 'string' || !route.context.trim() || Object.keys(route).some(key => !['paths', 'context'].includes(key))) throw new Error(`Invalid UI route on ${id}: provide paths and state context`);
      for (const section of ['startup', 'capabilities']) {
        const rows = card.usage[section];
        if (!Array.isArray(rows) || rows.some(row => !object(row) || !isHttpMethod(row.method) || typeof row.endpoint !== 'string' || !row.endpoint.startsWith('/') || typeof row.description !== 'string' || !row.description.trim() || Object.keys(row).some(key => !['method', 'endpoint', 'description'].includes(key)))) throw new Error(`Invalid ${section} endpoint list on ${id}`);
      }
      if (card.body !== undefined) throw new Error(`usage-card ${id} uses structured usage instead of body`);
    }
    if (card.badges !== undefined && (!Array.isArray(card.badges) || card.badges.some(value => typeof value !== 'string' || !value.trim()))) throw new Error(`Invalid badges on ${id}`);
    if (card.modifiers !== undefined && (!Array.isArray(card.modifiers) || card.modifiers.some(group => !object(group) || typeof group.name !== 'string' || !group.name.trim() || Object.keys(group).some(key => !['name', 'parameters'].includes(key)) || !Array.isArray(group.parameters) || group.parameters.some(row => !object(row) || typeof row.name !== 'string' || !row.name.trim() || typeof row.value !== 'string' || Object.keys(row).some(key => !['name', 'value'].includes(key)))))) throw new Error(`Invalid modifier sections on ${id}`);
    if (card.body !== undefined && typeof card.body !== 'string') throw new Error(`Invalid body on ${id}`);
    if (card.diff !== undefined && !isDiffKind(card.diff)) throw new Error(`Invalid diff on ${id}: expected new, additive, or modified`);
    if (card.info !== undefined && (typeof card.info !== 'string' || !card.info.trim())) throw new Error(`Invalid info reference on ${id}`);
    let footer: { text: string; href?: string } | undefined;
    if (card.footer !== undefined) {
      const value = card.footer;
      if (!object(value) || typeof value.text !== 'string' || Object.keys(value).some(key => !['text', 'href'].includes(key))) throw new Error(`Invalid footer on ${id}`);
      if (value.href !== undefined && (typeof value.href !== 'string' || !/^(https?:\/\/|zed:\/\/|mailto:|#)/i.test(value.href))) throw new Error(`Unsupported footer link on ${id}`);
      footer = { text: value.text, href: value.href as string | undefined };
    }
    node.card = { component: card.component as import('../graph.js').PortableCard['component'], ...(card.component === 'rest-card' ? { methods: card.methods as import('../rest.js').HttpMethod[] } : {}), ...(card.component === 'usage-card' ? { usage: card.usage as import('../graph.js').PortableCard['usage'] } : {}), ...(card.component === 'schema-card' ? { fields: card.fields as import('../graph.js').PortableCard['fields'], description: card.description as string | undefined, schemaKey: card.schemaKey as string | undefined } : {}), badges: card.badges as string[] | undefined, modifiers: card.modifiers as import('../graph.js').PortableCard['modifiers'], info: card.info as string | undefined, diff: card.diff as import('../diff.js').DiffKind | undefined, title: card.title, body: card.body as string | undefined, footer };
  }
}
