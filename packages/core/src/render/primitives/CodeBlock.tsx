import type { JSX } from 'solid-js';
import type { RenderContext } from '../../types.ts';

// Syntax highlighting is not included — plain monospace block is the first version.
// A future polish task can add a lightweight highlighter (e.g., highlight.js or
// shiki) without changing the component's API.

export default function CodeBlock(
  props: Record<string, unknown>,
  _ctx: RenderContext,
  _children: () => JSX.Element,
): JSX.Element {
  const value = String(props['value'] ?? '');

  const style: JSX.CSSProperties = {
    display: 'block',
    'font-family': 'monospace',
    'font-size': '11px',
    'line-height': '1.6',
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    'border-radius': '4px',
    padding: '8px 10px',
    'white-space': 'pre-wrap',
    'overflow-x': 'auto',
    margin: '2px 0',
  };

  return <pre style={style}><code>{value}</code></pre>;
}
