import type { JSX } from 'solid-js';
import { For } from 'solid-js';
import type { Node, RenderContext } from '@luminous/core';

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

export function TransitionPeek(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as TransitionProps;
  const label = p.event ?? node.id;
  return (
    <span style={{
      background: '#fff7d6',
      padding: '2px 8px',
      'border-radius': '999px',
      'font-family': 'ui-monospace, monospace',
      'font-size': '10px',
      'white-space': 'nowrap',
    }}>{label}</span>
  );
}

export function TransitionOpen(node: Node, ctx: RenderContext): JSX.Element {
  const p = node.props as TransitionProps;
  const label = p.event ?? node.id;

  // Find action nodes invoked by this transition via 'statechart.invokes-action' edges.
  const invokedActions: Array<{ id: string; name: string }> = [];
  const outEdgeIds = ctx.graph.outgoing.get(node.id) ?? new Set();
  for (const edgeId of outEdgeIds) {
    const edge = ctx.graph.edges.get(edgeId);
    if (edge?.kind === 'statechart.invokes-action') {
      const actionNode = ctx.graph.nodes.get(edge.to);
      if (actionNode) {
        const ap = actionNode.props as { signature?: string; name?: string };
        invokedActions.push({ id: edge.to, name: ap.signature ?? ap.name ?? edge.to });
      }
    }
  }

  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      padding: '10px 14px',
      'box-sizing': 'border-box',
    }}>
      <div style={{ 'margin-bottom': '8px' }}>
        <span style={{
          background: '#fff7d6',
          padding: '4px 12px',
          'border-radius': '999px',
          'font-family': 'ui-monospace, monospace',
          'font-size': '13px',
        }}>{label}</span>
      </div>
      {p.description && (
        <div style={{ 'font-size': '12px', color: '#555', 'margin-bottom': '8px' }}>{p.description}</div>
      )}
      {invokedActions.length > 0 && (
        <div>
          <div style={{ 'font-size': '11px', 'font-weight': '600', color: '#888', 'margin-bottom': '4px' }}>Actions</div>
          <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }}>
            <For each={invokedActions}>{a => (
              <span
                style={{
                  background: '#f0f0f0',
                  padding: '2px 8px',
                  'border-radius': '4px',
                  'font-size': '11px',
                  cursor: 'pointer',
                  'text-decoration': 'underline',
                  color: '#333',
                }}
                onClick={() => ctx.inspect(a.id)}
              >{a.name}</span>
            )}</For>
          </div>
        </div>
      )}
    </div>
  );
}
