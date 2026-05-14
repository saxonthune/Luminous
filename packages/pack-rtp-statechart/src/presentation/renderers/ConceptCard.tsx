import type { JSX } from 'solid-js';
import type { Node, RenderContext } from '@luminous/canvas-core';

type ConceptProps = {
  name?: string;
  purpose?: string;
  state?: string;
  operationalPrinciple?: string;
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

export function ConceptPeek(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as ConceptProps;
  const title = p.name ?? node.id;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #d0d0d0',
      'border-radius': '4px',
      padding: '2px 6px',
      'font-size': '10px',
      'white-space': 'nowrap',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'max-width': '120px',
    }}>{title}</div>
  );
}

export function ConceptOpen(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as ConceptProps;
  const title = p.name ?? node.id;
  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      padding: '10px 14px',
      'box-sizing': 'border-box',
    }}>
      <div style={{ 'font-size': '15px', 'font-weight': '700', 'margin-bottom': '8px' }}>{title}</div>
      {p.purpose && (
        <div>
          <div style={{ 'font-size': '11px', 'font-weight': '600', color: '#888', 'margin-bottom': '2px' }}>Purpose</div>
          <div style={{ 'font-size': '12px', color: '#444', 'margin-bottom': '8px' }}>{p.purpose}</div>
        </div>
      )}
      {p.state && (
        <div>
          <div style={{ 'font-size': '11px', 'font-weight': '600', color: '#888', 'margin-bottom': '2px' }}>State</div>
          <div style={{ 'font-size': '12px', color: '#444', 'margin-bottom': '8px' }}>{p.state}</div>
        </div>
      )}
      {p.operationalPrinciple && (
        <div>
          <div style={{ 'font-size': '11px', 'font-weight': '600', color: '#888', 'margin-bottom': '2px' }}>Operational Principle</div>
          <div style={{ 'font-size': '12px', color: '#444' }}>{p.operationalPrinciple}</div>
        </div>
      )}
    </div>
  );
}
