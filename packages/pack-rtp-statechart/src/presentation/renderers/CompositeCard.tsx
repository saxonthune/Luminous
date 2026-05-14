import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/canvas-core';

type CompositeProps = {
  description?: string;
  tags?: string[];
  parallel?: boolean;
  name?: string;
};

function idSegment(id: string): string {
  const parts = id.split('.');
  return parts[parts.length - 1] ?? id;
}

export default function CompositeCard(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as CompositeProps;
  const title = p.name ?? idSegment(node.id);

  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      'box-sizing': 'border-box',
    }}>
      <div style={{
        background: '#f7f7f7',
        padding: '6px 10px',
        'border-radius': '6px 6px 0 0',
        display: 'flex',
        'align-items': 'center',
        gap: '6px',
      }}>
        <span style={{ 'font-size': '14px', 'font-weight': '600' }}>{title}</span>
        {p.parallel && (
          <span style={{
            'font-size': '12px',
            color: '#555',
            background: '#e8e8e8',
            padding: '1px 6px',
            'border-radius': '4px',
          }}>‖</span>
        )}
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

export function CompositePeek(node: Node, ctx: RenderContext): JSX.Element {
  const p = node.props as CompositeProps;
  const title = p.name ?? idSegment(node.id);
  // Count substates: edges with kind 'statechart.substate-of' that point TO this node.
  const substateKind = 'statechart.substate-of';
  const incomingEdgeIds = ctx.graph.incoming.get(node.id) ?? new Set();
  let substateCount = 0;
  for (const edgeId of incomingEdgeIds) {
    const edge = ctx.graph.edges.get(edgeId);
    if (edge?.kind === substateKind) substateCount++;
  }
  return (
    <div style={{
      background: '#f7f7f7',
      border: '1px solid #d0d0d0',
      'border-radius': '4px',
      padding: '2px 6px',
      'font-size': '10px',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'max-width': '120px',
    }}>
      {title}{substateCount > 0 ? ` (${substateCount})` : ''}
    </div>
  );
}

export function CompositeOpen(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as CompositeProps;
  const title = p.name ?? idSegment(node.id);
  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      'box-sizing': 'border-box',
    }}>
      <div style={{
        background: '#f7f7f7',
        padding: '8px 12px',
        'border-radius': '6px 6px 0 0',
        display: 'flex',
        'align-items': 'center',
        gap: '8px',
      }}>
        <span style={{ 'font-size': '15px', 'font-weight': '700' }}>{title}</span>
        {p.parallel && (
          <span style={{
            'font-size': '12px',
            color: '#555',
            background: '#e8e8e8',
            padding: '2px 8px',
            'border-radius': '4px',
          }}>parallel ‖</span>
        )}
      </div>
      {p.description && (
        <div style={{
          padding: '8px 12px',
          'font-size': '12px',
          color: '#555',
        }}>{p.description}</div>
      )}
    </div>
  );
}
