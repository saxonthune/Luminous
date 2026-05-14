import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/canvas-core';

type ActionProps = {
  signature?: string;
  conceptId?: string;
};

function conceptLabel(conceptId: string): string {
  return conceptId.replace(/^concept\./, '');
}

export default function ActionCard(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as ActionProps;
  const label = p.conceptId ? conceptLabel(p.conceptId) : '';

  return (
    <div
      data-orphan="false"
      style={{
        'border-radius': '6px',
        border: '1px solid #d0d0d0',
        background: '#fff',
        padding: '8px 12px',
        'box-sizing': 'border-box',
      }}
    >
      <div style={{
        'font-family': 'ui-monospace, monospace',
        'font-size': '12px',
        'margin-bottom': '6px',
      }}>{p.signature ?? node.id}</div>
      {label && (
        <span style={{
          background: '#f0f0f0',
          padding: '2px 8px',
          'border-radius': '999px',
          'font-size': '11px',
          color: '#555',
        }}>{label}</span>
      )}
    </div>
  );
}
