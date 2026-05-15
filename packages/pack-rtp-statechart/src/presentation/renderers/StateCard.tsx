import type { JSX } from 'solid-js';
import { For } from 'solid-js';
import type { Node, RenderContext } from '@luminous/core';

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
          <For each={tags}>{tag => (
            <span style={{
              background: '#f0f0f0',
              padding: '2px 8px',
              'border-radius': '999px',
              'font-size': '11px',
            }}>{tag}</span>
          )}</For>
        </div>
      )}
    </div>
  );
}

export function StatePeek(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as StateProps;
  const title = p.surface ?? p.name ?? idSegment(node.id);
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

export function StateOpen(node: Node, _ctx: RenderContext): JSX.Element {
  const p = node.props as StateProps;
  const title = p.name ?? idSegment(node.id);
  const tags = p.tags ?? [];
  const reads = p.reads ?? [];
  return (
    <div style={{
      'border-radius': '6px',
      border: '1px solid #d0d0d0',
      background: '#fff',
      padding: '10px 14px',
      'box-sizing': 'border-box',
    }}>
      <div style={{ 'font-size': '14px', 'font-weight': '700', 'margin-bottom': '4px' }}>{title}</div>
      {p.surface && (
        <div style={{
          'font-family': 'ui-monospace, monospace',
          'font-size': '12px',
          color: '#333',
          'margin-bottom': '6px',
        }}>{p.surface}</div>
      )}
      {p.description && (
        <div style={{ 'font-size': '12px', color: '#666', 'margin-bottom': '6px' }}>{p.description}</div>
      )}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap', 'margin-bottom': '6px' }}>
          <For each={tags}>{tag => (
            <span style={{
              background: '#f0f0f0',
              padding: '2px 8px',
              'border-radius': '999px',
              'font-size': '11px',
            }}>{tag}</span>
          )}</For>
        </div>
      )}
      {reads.length > 0 && (
        <div style={{ 'font-size': '11px', color: '#888' }}>
          <span style={{ 'font-weight': '600' }}>reads: </span>
          <For each={reads}>{r => (
            <span style={{
              background: '#e8f4fd',
              padding: '1px 6px',
              'border-radius': '3px',
              'margin-right': '4px',
              'font-size': '11px',
            }}>{r}</span>
          )}</For>
        </div>
      )}
    </div>
  );
}
