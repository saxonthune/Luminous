import { Marked } from 'marked';

export interface InfoInput { title: string; body: string }
export interface ExtendedInfo { title: string; html: string }
export function parseInfo(input: unknown): Record<string, InfoInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('portable-info must map IDs to { title, body }');
  for (const [id, value] of Object.entries(input)) {
    if (!id.trim() || !value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(k => !['title', 'body'].includes(k))
      || typeof (value as InfoInput).title !== 'string' || !(value as InfoInput).title.trim()
      || typeof (value as InfoInput).body !== 'string') throw new Error(`Invalid portable-info entry ${id}: expected title and Markdown body`);
  }
  return input as Record<string, InfoInput>;
}
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/** Compile declarative Markdown once. Never execute author HTML or fetch remote images. */
export function renderInfo(input: Record<string, InfoInput> = {}): Record<string, ExtendedInfo> {
  const parser = new Marked({ renderer: {
    html: ({ text }) => escape(text),
    image: ({ text }) => escape(text),
    link({ href, tokens, title }) {
      const label = this.parser.parseInline(tokens);
      // Zed's installed handler expects zed://file/absolute/path.
      const target = href.replace(/^zed:\/\/\//i, 'zed://file/');
      if (!/^(https?:\/\/|mailto:|#|zed:\/\/file\/)/i.test(target)) return label;
      return `<a href="${escape(target)}"${title ? ` title="${escape(title)}"` : ''} rel="noreferrer">${label}</a>`;
    },
  } });
  return Object.fromEntries(Object.entries(input).map(([id, entry]) => [id, { title: entry.title, html: parser.parse(entry.body, { async: false }) }]));
}
