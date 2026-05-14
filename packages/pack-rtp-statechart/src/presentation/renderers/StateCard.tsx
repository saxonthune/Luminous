import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/canvas-core';

type StateProps = {
  description?: string;
  tags?: string[];
  surface?: string;
  reads?: string[];
  name?: string;
};

function idSegment(id: string): string {
  const parts = id.split('.');
  return parts[parts.length - 1] ?? id;
}

export default function StateCard(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as StateProps;
  const title = p.name ?? idSegment(node.id);
  const tags = p.tags ?? [];
  const reads = p.reads;

  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      padding: '8px 12px',
      'box-sizing': 'border-box',
    }}>
      <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between' }}>
        <div style={{ 'font-size': '14px', 'font-weight': '600' }}>{title}</div>
        {reads && reads.length > 0 && (
          <div style={{ 'font-size': '11px', color: '#666' }}>reads: {reads.join(', ')}</div>
        )}
      </div>
      {p.surface && (
        <div style={{
          'font-family': 'ui-monospace, monospace',
          'font-size': '11px',
          color: '#444',
          'margin-top': '4px',
        }}>{p.surface}</div>
      )}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap', 'margin-top': '6px' }}>
          {tags.map(tag => (
            <span style={{
              background: '#f0f0f0',
              padding: '2px 8px',
              'border-radius': '999px',
              'font-size': '11px',
            }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
