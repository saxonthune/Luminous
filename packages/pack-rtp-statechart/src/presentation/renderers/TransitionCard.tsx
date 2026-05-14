import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/canvas-core';

type TransitionProps = {
  event?: string;
  description?: string;
  actions?: string[];
};

export default function TransitionCard(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as TransitionProps;
  const actions = p.actions ?? [];

  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      padding: '8px 12px',
      'box-sizing': 'border-box',
    }}>
      {p.event && (
        <div style={{ 'margin-bottom': '6px' }}>
          <span style={{
            background: '#fff7d6',
            padding: '4px 10px',
            'border-radius': '999px',
            'font-family': 'ui-monospace, monospace',
            'font-size': '12px',
          }}>{p.event}</span>
        </div>
      )}
      {!p.event && (
        <div style={{ 'margin-bottom': '6px' }}>
          <span style={{
            background: '#fff7d6',
            padding: '4px 10px',
            'border-radius': '999px',
            'font-family': 'ui-monospace, monospace',
            'font-size': '12px',
          }}>{node.id}</span>
        </div>
      )}
      {p.description && (
        <div style={{ 'font-size': '12px', color: '#666', 'margin-bottom': '4px' }}>{p.description}</div>
      )}
      {actions.length > 0 && (
        <div style={{ 'font-size': '11px', color: '#888' }}>→ {actions.join(', ')}</div>
      )}
    </div>
  );
}
