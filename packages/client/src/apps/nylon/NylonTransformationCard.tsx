import { For, Show, createMemo, createUniqueId } from 'solid-js';
import type { NylonDocument, NylonTransformation } from '@luminous/core/nylon';
import { nylonContentsSchematic } from '@luminous/core/nylon/standardLayout';

export function NylonTransformationCard(props: {
  doc: NylonDocument;
  item: NylonTransformation;
  selected: boolean;
  onOpen?: (id: string) => void;
}) {
  const arrowId = createUniqueId();
  const contents = createMemo(() => ({
    transformations: props.doc.transformations.filter((item) => item.parent === props.item.id).length,
    contracts: props.doc.contracts.filter((item) => item.parent === props.item.id).length,
  }));
  const hasContents = () => contents().transformations + contents().contracts > 0;
  const schematic = createMemo(() => hasContents() ? nylonContentsSchematic(props.doc, props.item.id) : null);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', 'flex-direction': 'column',
      padding: '14px', gap: '8px', 'box-sizing': 'border-box', overflow: 'hidden',
      background: 'var(--surface)', color: 'var(--fg)', 'border-radius': '8px',
      border: `2px solid ${props.selected ? 'var(--accent)' : 'var(--border-strong)'}`,
      'box-shadow': 'var(--shadow-sm)' }}>
      <div style={{ 'font-size': '11px', 'letter-spacing': '.06em', 'text-transform': 'uppercase', color: 'var(--fg-muted)' }}>
        {hasContents() ? 'Transformation · contains detail' : 'Transformation'}
      </div>
      <strong title={props.item.name} style={{ 'font-size': '20px', 'line-height': '1.15', display: '-webkit-box',
        '-webkit-line-clamp': 2, '-webkit-box-orient': 'vertical', overflow: 'hidden', 'flex-shrink': 0 }}>{props.item.name}</strong>
      <Show when={props.item.prose}>
        <p style={{ margin: 0, 'font-size': '14px', 'line-height': '1.4', display: '-webkit-box',
          '-webkit-line-clamp': 2, '-webkit-box-orient': 'vertical', overflow: 'hidden', 'flex-shrink': 0 }}>{props.item.prose}</p>
      </Show>
      <Show when={schematic()} fallback={
        <div style={{ flex: 1, 'font-size': '13px', color: 'var(--fg-muted)', overflow: 'hidden' }}>
          <Show when={props.item.needs?.length}>
            <strong>Data needed</strong>
            <For each={props.item.needs}>{(need) => <div>{need}</div>}</For>
          </Show>
        </div>
      }>{(preview) => (
        <svg aria-label={`Contents schematic of ${props.item.name}`} role="img"
          viewBox={`-6 -6 ${preview().width + 12} ${preview().height + 12}`}
          style={{ width: '100%', flex: '1 1 auto', 'min-height': '40px', 'max-height': '100px',
            background: 'var(--surface-alt)', 'border-radius': '4px', 'pointer-events': 'none' }}>
          <defs><marker id={arrowId} viewBox="0 0 6 6" refX="6" refY="3" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--fg-muted)" />
          </marker></defs>
          <For each={preview().edges}>{(edge) => {
            const source = () => preview().nodes.find((node) => node.id === edge.sourceId)!;
            const target = () => preview().nodes.find((node) => node.id === edge.targetId)!;
            return <line x1={source().x + source().w} y1={source().y + source().h / 2}
              x2={target().x} y2={target().y + target().h / 2} stroke="var(--fg-muted)" stroke-width="1.5"
              marker-end={`url(#${arrowId})`} />;
          }}</For>
          <For each={preview().nodes}>{(node) => (
            <g>
              <rect x={node.x} y={node.y} width={node.w} height={node.h}
                rx={node.kind === 'contract' ? 8 : 1}
                fill={node.kind === 'contract' ? 'var(--color-kind-signal-bg)' : 'var(--surface)'}
                stroke={node.kind === 'contract' ? 'var(--color-token-moss)' : 'var(--fg-muted)'} stroke-width="1.5" />
              <Show when={node.kind === 'container'}>
                <rect x={node.x + 5} y={node.y + 5} width={node.w - 10} height={node.h - 10}
                  fill="none" stroke="var(--fg-muted)" stroke-width="1" />
              </Show>
            </g>
          )}</For>
        </svg>
      )}</Show>
      <Show when={hasContents()}>
        <div style={{ 'margin-top': 'auto', display: 'flex', 'align-items': 'center', gap: '6px',
          'flex-shrink': 0, 'font-size': '11px', color: 'var(--fg-muted)' }}>
          <span style={{ flex: 1 }}>{contents().transformations} Transformations · {contents().contracts} Contracts</span>
          <button type="button" aria-label={`Open contents of ${props.item.name}`}
            title="Open contents in a new tab" data-no-pan
            style={{ padding: '4px 6px', border: '1px solid var(--border-strong)', 'border-radius': '4px',
              background: 'var(--surface-alt)', color: 'var(--fg)', cursor: 'pointer', 'white-space': 'nowrap' }}
            on:pointerdown={(event) => event.stopPropagation()}
            on:click={(event) => { event.stopPropagation(); props.onOpen?.(props.item.id); }}>Open contents ↗</button>
        </div>
      </Show>
    </div>
  );
}
