import { Marked } from "marked";

export const MARKDOWN_STYLE = `
.hemp-markdown { overflow-wrap: anywhere; }
.hemp-markdown p, .hemp-markdown pre, .hemp-markdown table, .hemp-markdown ul, .hemp-markdown ol { margin: .75rem 0; }
.hemp-markdown h1, .hemp-markdown h2, .hemp-markdown h3, .hemp-markdown h4 { font-weight: 600; margin: 1rem 0 .5rem; }
.hemp-markdown h1 { font-size: 1.25rem; } .hemp-markdown h2 { font-size: 1.1rem; }
.hemp-markdown ul { list-style: disc; padding-left: 1.4rem; } .hemp-markdown ol { list-style: decimal; padding-left: 1.4rem; }
.hemp-markdown code { font-family: monospace; background: var(--surface-alt); padding: .1rem .2rem; border-radius: 3px; }
.hemp-markdown pre { overflow-x: auto; background: var(--surface-alt); padding: .6rem; }
.hemp-markdown pre code { padding: 0; }
.hemp-markdown table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.hemp-markdown th, .hemp-markdown td { border: 1px solid var(--border-subtle); padding: .4rem .6rem; vertical-align: top; text-align: left; }
.hemp-markdown th { background: var(--surface-alt); font-weight: 600; }
.hemp-markdown a { color: var(--accent); text-decoration: underline; }
.hemp-markdown blockquote { border-left: 3px solid var(--border-subtle); padding-left: .75rem; color: var(--fg-muted); }
`;

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Source comments are text, not executable HTML. Retain Markdown formatting,
// including GFM tables, while disabling embedded HTML and unsafe link schemes.
const markdown = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escape(text);
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      try {
        const url = new URL(href, "https://hemp.invalid");
        if (!["http:", "https:", "mailto:"].includes(url.protocol)) return label;
      } catch {
        return label;
      }
      return `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
    image({ text }) {
      return escape(text);
    },
  },
});

export function hempMarkdown(text: string): string {
  return markdown.parse(text, { async: false });
}
