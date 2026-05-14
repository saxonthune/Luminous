import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/canvas-core';

type RegionProps = {
  description?: string;
  name?: string;
};

function idSegment(id: string): string {
  const parts = id.split('.');
  return parts[parts.length - 1] ?? id;
}

export default function RegionCard(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as RegionProps;
  const title = p.name ?? idSegment(node.id);

  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      'box-sizing': 'border-box',
    }}>
      <div style={{
        background: '#e6f3f1',
        padding: '6px 10px',
        'border-radius': '6px 6px 0 0',
        display: 'flex',
        'align-items': 'center',
        gap: '6px',
      }}>
        <span style={{
          'font-size': '10px',
          'font-variant': 'small-caps',
          color: '#3a7a72',
          'letter-spacing': '0.05em',
        }}>region</span>
        <span style={{ 'font-size': '14px', 'font-weight': '600' }}>{title}</span>
      </div>
      {p.description && (
        <div style={{
          padding: '8px 10px',
          'font-size': '12px',
          color: '#666',
        }}>{p.description}</div>
      )}
    </div>
  );
}
