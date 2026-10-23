import { parseInfo } from './extended-info.js';
import { isDiffKind } from '../diff.js';
import { parse as parseYaml } from 'yaml';
import { applyNodeContent } from './node-content.js';
import { Marked } from 'marked';
import { importMermaid } from './mermaid.js';
import { parseModel, type ParsedDocument, type ParsedDiagram } from '../semantics.js';


const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Markdown is content, not executable HTML. Canvas slots are generated here. */
export async function importMarkdown(source: string): Promise<ParsedDocument> {
  let model: ParsedDocument['model'];
  let info: ParsedDocument['info'];
  let searchOffset = 0;
  const sources: { text: string; line: number; mode?: 'action-flow'; content?: unknown; settings?: ParsedDiagram['settings'] }[] = [];
  const markdown = new Marked({ renderer: {
    html({ text }) { return escape(text); },
    code(token) {
      const offset = source.indexOf(token.raw, searchOffset);
      const line = offset < 0 ? 1 : source.slice(0, offset).split('\n').length;
      if (offset >= 0) searchOffset = offset + token.raw.length;
      if (token.lang?.trim() === 'portable-info') {
        if (info) throw new Error('Only one portable-info block is allowed per document');
        info = parseInfo(parseYaml(token.text));
        return '';
      }
      if (token.lang?.trim() === 'portable-model') {
        if (model) throw new Error('Only one portable-model block is allowed per document');
        model = parseModel(parseYaml(token.text));
        return '';
      }
      if (token.lang?.trim() === 'portable-canvas') {
        const diagram = sources.at(-1);
        if (!diagram) throw new Error('portable-canvas must follow a Mermaid diagram');
        if (diagram.settings) throw new Error('Only one portable-canvas block is allowed per diagram');
        const settings = parseYaml(token.text);
        if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).some(key => !['title', 'scrollZoom', 'legend', 'kinds', 'layout'].includes(key)) || (settings.scrollZoom !== undefined && typeof settings.scrollZoom !== 'boolean')) throw new Error('portable-canvas accepts title, scrollZoom, legend, kinds, and layout');
        if (settings.title !== undefined && (typeof settings.title !== 'string' || !settings.title.trim())) throw new Error('portable-canvas title must be a non-empty string');
        if (settings.layout !== undefined) {
          const layout = settings.layout;
          if (!layout || typeof layout !== 'object' || Array.isArray(layout) || Object.keys(layout).some(key => key !== 'nonOrderingEdges') || !Array.isArray(layout.nonOrderingEdges)
            || layout.nonOrderingEdges.some((edge: any) => !edge || typeof edge !== 'object' || Array.isArray(edge) || Object.keys(edge).some(key => !['source', 'target'].includes(key)) || typeof edge.source !== 'string' || typeof edge.target !== 'string')) throw new Error('layout accepts nonOrderingEdges: [{ source, target }]');
        }
        if (settings.kinds !== undefined && (!settings.kinds || typeof settings.kinds !== 'object' || Array.isArray(settings.kinds) || Object.values(settings.kinds).some(value => typeof value !== 'string' || !value.trim()))) throw new Error('kinds must map node IDs to nonempty kind IDs');
        if (settings.legend !== undefined) {
          const legend = settings.legend;
          if (!legend || typeof legend !== 'object' || Array.isArray(legend)
            || Object.keys(legend).some(key => !['entries'].includes(key))
            || !Array.isArray(legend.entries) || legend.entries.length === 0)
            throw new Error('legend accepts only a nonempty entries array; its header is always Legend');
          for (const entry of legend.entries) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)
              || Object.keys(entry).some(key => !['class', 'diff', 'kind', 'label'].includes(key))
              || (['class', 'diff', 'kind'].filter(key => key in entry).length !== 1)
              || ('class' in entry && (typeof entry.class !== 'string' || !entry.class.trim()))
              || ('kind' in entry && (typeof entry.kind !== 'string' || !entry.kind.trim()))
              || ('diff' in entry && !isDiffKind(entry.diff))
              || (entry.label !== undefined && (typeof entry.label !== 'string' || !entry.label.trim())))
              throw new Error('legend entries require exactly one kind, class or diff (new, additive, modified), and optional nonempty label');
          }
        }
        diagram.settings = settings;
        return '';
      }
      if (token.lang?.trim() === 'portable-nodes') {
        const diagram = sources.at(-1);
        if (!diagram) throw new Error('portable-nodes must follow a Mermaid diagram');
        if (diagram.content !== undefined) throw new Error('Only one portable-nodes block is allowed per diagram');
        diagram.content = parseYaml(token.text);
        return '';
      }
      if (token.lang?.trim().split(/\s+/)[0] !== 'mermaid') return false;
      const index = sources.push({ text: token.text, line, mode: token.lang?.trim().split(/\s+/)[1] === 'action-flow' ? 'action-flow' : undefined }) - 1;
      return `<div data-portable-canvas="${index}"></div>`;
    },
    link({ href, tokens, title }) {
      const label = this.parser.parseInline(tokens);
      // Allow only explicit web/mail links and local document anchors.
      if (!/^(https?:\/\/|mailto:|#)/i.test(href)) return label;
      return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''} rel="noreferrer">${label}</a>`;
    },
    image({ text }) { return `<span>${escape(text)}</span>`; },
  } });
  const html = markdown.parse(source, { async: false });
  const diagrams: ParsedDiagram[] = [];
  for (const [index, text] of sources.entries()) {
    try {
      const graph = importMermaid(text.text);
      if (text.content !== undefined) applyNodeContent(graph, text.content);
      diagrams.push({ id: `canvas-${index + 1}`, graph, settings: text.settings, line: text.line, mode: text.mode });
    } catch (error) {
      throw new Error(`Mermaid block ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { html, diagrams, model, info };
}
