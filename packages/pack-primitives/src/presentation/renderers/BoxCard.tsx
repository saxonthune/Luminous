import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/core';
import { NodeBody } from '@luminous/cactus';

type BoxProps = {
  label: string;
  description?: string;
  color?: string;
  tag?: string;
};

export default function BoxCard(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as BoxProps;
  const borderColor = p.color ?? '#d0d0d0';
  return (
    <NodeBody
      direction="vertical"
      padding="8px 12px"
      gap={4}
      style={{
        'border-radius': '6px',
        border: `1px solid ${borderColor}`,
        'border-left': `4px solid ${borderColor}`,
        background: '#fff',
        width: '100%',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '8px' }}>
        <div style={{ 'font-size': '14px', 'font-weight': '600' }}>{p.label}</div>
        {p.tag && (
          <div style={{
            'font-size': '10px',
            padding: '2px 6px',
            'border-radius': '4px',
            background: '#eee',
            color: '#666',
          }}>{p.tag}</div>
        )}
      </div>
      {p.description && (
        <div style={{ 'font-size': '11px', color: '#666' }}>{p.description}</div>
      )}
    </NodeBody>
  );
}
