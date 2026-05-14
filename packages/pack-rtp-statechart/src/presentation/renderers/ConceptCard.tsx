import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/canvas-core';

type ConceptProps = {
  name?: string;
  purpose?: string;
};

export default function ConceptCard(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as ConceptProps;
  const title = p.name ?? node.id;

  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      padding: '8px 12px',
      'box-sizing': 'border-box',
    }}>
      <div style={{ 'font-size': '14px', 'font-weight': '600', 'margin-bottom': '4px' }}>{title}</div>
      {p.purpose && (
        <div style={{
          'font-size': '12px',
          color: '#666',
          'white-space': 'nowrap',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
        }}>{p.purpose}</div>
      )}
    </div>
  );
}
