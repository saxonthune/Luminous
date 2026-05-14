import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/core';

type ActionProps = {
  signature?: string;
  conceptId?: string;
  description?: string;
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

export function ActionPeek(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as ActionProps;
  const sig = p.signature ?? node.id;
  return (
    <span style={{
      'font-family': 'ui-monospace, monospace',
      'font-size': '10px',
      background: '#f8f8f8',
      border: '1px solid #d0d0d0',
      'border-radius': '3px',
      padding: '2px 6px',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'max-width': '140px',
      display: 'block',
    }}>{sig}</span>
  );
}

export function ActionOpen(node: Node, ctx: RenderContext): JSX.Element {
  const p = node.props as ActionProps;
  const label = p.conceptId ? conceptLabel(p.conceptId) : '';

  // Find transitions that invoke this action via 'statechart.invokes-action' edges.
  const invokedBy: Array<{ id: string; name: string }> = [];
  const inEdgeIds = ctx.graph.incoming.get(node.id) ?? new Set();
  for (const edgeId of inEdgeIds) {
    const edge = ctx.graph.edges.get(edgeId);
    if (edge?.kind === 'statechart.invokes-action') {
      const transNode = ctx.graph.nodes.get(edge.from);
      if (transNode) {
        const tp = transNode.props as { event?: string };
        invokedBy.push({ id: edge.from, name: tp.event ?? edge.from });
      }
    }
  }

  return (
    <div
      data-orphan="false"
      style={{
        'border-radius': '6px',
        border: '1px solid #d0d0d0',
        background: '#fff',
        padding: '10px 14px',
        'box-sizing': 'border-box',
      }}
    >
      <div style={{
        'font-family': 'ui-monospace, monospace',
        'font-size': '13px',
        'margin-bottom': '6px',
      }}>{p.signature ?? node.id}</div>
      {p.description && (
        <div style={{ 'font-size': '12px', color: '#555', 'margin-bottom': '8px' }}>{p.description}</div>
      )}
      {label && (
        <div style={{ 'margin-bottom': '8px' }}>
          <span style={{
            background: '#f0f0f0',
            padding: '2px 8px',
            'border-radius': '999px',
            'font-size': '11px',
            color: '#555',
          }}>{label}</span>
        </div>
      )}
      {invokedBy.length > 0 && (
        <div>
          <div style={{ 'font-size': '11px', 'font-weight': '600', color: '#888', 'margin-bottom': '4px' }}>Invoked by</div>
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            {invokedBy.map(t => (
              <span
                style={{
                  background: '#fff7d6',
                  padding: '2px 8px',
                  'border-radius': '4px',
                  'font-size': '11px',
                  cursor: 'pointer',
                  'text-decoration': 'underline',
                  color: '#333',
                  'font-family': 'ui-monospace, monospace',
                }}
                onClick={() => ctx.inspect(t.id)}
              >{t.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
