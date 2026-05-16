import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

// Minimal markdown renderer — no external dependency. Covers: headings (h1–h3),
// unordered lists, bold, italic, inline code, and paragraphs.
// Full CommonMark (tables, nested lists, etc.) is out of scope; noted for a
// future polish task.

function inlineMarkup(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<>{text.slice(last, match.index)}</>);
    }
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <code style={{ 'font-family': 'monospace', 'font-size': '11px', background: '#f3f4f6', 'border-radius': '2px', padding: '0 3px' }}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**')) {
      parts.push(<strong>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push(<>{text.slice(last)}</>);
  }
  return parts;
}

function renderLine(line: string): JSX.Element {
  if (line.startsWith('### ')) {
    return <h3 style={{ 'font-size': '13px', 'font-weight': '600', margin: '4px 0 2px' }}>{inlineMarkup(line.slice(4))}</h3>;
  }
  if (line.startsWith('## ')) {
    return <h2 style={{ 'font-size': '14px', 'font-weight': '600', margin: '4px 0 2px' }}>{inlineMarkup(line.slice(3))}</h2>;
  }
  if (line.startsWith('# ')) {
    return <h1 style={{ 'font-size': '16px', 'font-weight': '700', margin: '4px 0 2px' }}>{inlineMarkup(line.slice(2))}</h1>;
  }
  if (line.startsWith('- ') || line.startsWith('* ')) {
    return (
      <li style={{ 'font-size': '12px', 'margin-left': '16px', 'list-style-type': 'disc' }}>
        {inlineMarkup(line.slice(2))}
      </li>
    );
  }
  if (line.trim() === '') {
    return <br />;
  }
  return <p style={{ 'font-size': '12px', margin: '2px 0' }}>{inlineMarkup(line)}</p>;
}

export default function Markdown(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const value = String(props['value'] ?? '');
  const lines = value.split('\n');
  return <div style={{ 'line-height': '1.5' }}>{lines.map((line) => renderLine(line))}</div>;
}
