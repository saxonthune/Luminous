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
    if (!object(card) || !['card', 'rest-card', 'transition', 'usage-card'].includes(String(card.component)) || typeof card.title !== 'string') {
      throw new Error(`portable-nodes: ${id} needs component: card, rest-card, transition or usage-card and a string title`);
    }
    if (card.component === 'transition' && Object.keys(card).some(key => !['component', 'title'].includes(key))) throw new Error(`Transition ${id} accepts only component and title`);
    if (Object.keys(card).some(key => !['component', 'title', 'body', 'footer', 'diff', 'info', ...(card.component === 'rest-card' ? ['methods'] : []), ...(card.component === 'usage-card' ? ['usage'] : [])].includes(key))) throw new Error(`Unknown card field on ${id}`);
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
    node.card = { component: card.component as 'card' | 'rest-card' | 'transition' | 'usage-card', ...(card.component === 'rest-card' ? { methods: card.methods as import('../rest.js').HttpMethod[] } : {}), ...(card.component === 'usage-card' ? { usage: card.usage as import('../graph.js').PortableCard['usage'] } : {}), info: card.info as string | undefined, diff: card.diff as import('../diff.js').DiffKind | undefined, title: card.title, body: card.body as string | undefined, footer };
  }
}
