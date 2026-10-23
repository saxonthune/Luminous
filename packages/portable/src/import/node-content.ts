import { isDiffKind } from '../diff.js';
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
    if (!object(card) || card.component !== 'card' || typeof card.title !== 'string') {
      throw new Error(`portable-nodes: ${id} needs component: card and a string title`);
    }
    if (Object.keys(card).some(key => !['component', 'title', 'body', 'footer', 'diff', 'info'].includes(key))) throw new Error(`Unknown card field on ${id}`);
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
    node.card = { component: 'card', info: card.info as string | undefined, diff: card.diff as import('../diff.js').DiffKind | undefined, title: card.title, body: card.body as string | undefined, footer };
  }
}
