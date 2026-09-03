import { Index, Show, createMemo, type JSX } from 'solid-js';
import { Canvas, NodeContainer, useCanvasContext } from '@luminous/cactus';
import type { CanvasRef } from '@luminous/cactus';
import type { RayonCarrier, RayonImpulseFrame, RayonRuntimeView } from './runtime.ts';
import { projectRayon, type RayonNodeKind, type RayonRenderNode } from './projection.ts';

export interface RayonCanvasProps {
  view: RayonRuntimeView;
  activeFrame: RayonImpulseFrame | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReady: (ref: CanvasRef) => void;
}

const KIND_STYLE: Record<RayonNodeKind, { fill: string; border: string; tag: string }> = {
  instruction: { fill: 'var(--surface)', border: 'var(--border-strong)', tag: 'instruction' },
  data: { fill: 'var(--color-kind-signal-bg)', border: 'var(--color-kind-signal-border)', tag: 'runtime data' },
  output: { fill: 'var(--color-kind-datasource-bg)', border: 'var(--color-kind-datasource-border)', tag: 'interface' },
  boundary: { fill: 'var(--color-kind-memo-bg)', border: 'var(--color-kind-memo-border)', tag: 'branch' },
  browser: { fill: 'var(--color-kind-effect-bg)', border: 'var(--color-kind-effect-border)', tag: 'browser' },
};

const CARRIER_COLOR: Record<RayonCarrier, string> = {
  event: 'var(--color-kind-effect-border)',
  control: 'var(--accent)',
  value: 'var(--color-kind-signal-border)',
  mutation: 'var(--color-kind-store-border)',
  structure: 'var(--color-kind-datasource-border)',
};

export function RayonCanvas(props: RayonCanvasProps): JSX.Element {
  const projection = createMemo(() => projectRayon(props.view, props.activeFrame));
  const activeNode = createMemo(() => projection().nodes.find((node) => node.id === props.activeFrame?.nodeId) ?? null);

  return (
    <Canvas
      ref={props.onReady}
      edges={projection().edges}
      clusters={projection().clusters}
      edgeEmphasis={{ dimUnselected: false, selectedWidthMultiplier: 1.5 }}
      onSelectionChange={(ids) => props.onSelect(ids[0] ?? null)}
    >
      <RayonNodeLayer nodes={() => projection().nodes} selectedId={() => props.selectedId} />
      <Show when={activeNode()}>
        {(node) => <ImpulseMarker node={node} frame={() => props.activeFrame} />}
      </Show>
    </Canvas>
  );
}

function RayonNodeLayer(props: { nodes: () => RayonRenderNode[]; selectedId: () => string | null }): JSX.Element {
  const ctx = useCanvasContext();
  return (
    <Index each={props.nodes()}>
      {(node) => {
        const style = () => KIND_STYLE[node().kind];
        return (
          <NodeContainer
            nodeId={node().id}
            x={() => node().x}
            y={() => node().y}
            w={() => node().w}
            h={() => node().h}
            onPointerDown={(event) => ctx.onNodePointerDown(node().id, event)}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                padding: '10px 12px',
                background: node().active
                  ? `color-mix(in oklch, ${style().fill} 72%, var(--accent) 28%)`
                  : style().fill,
                border: `1px solid ${node().active ? 'var(--accent)' : style().border}`,
                'border-radius': '9px',
                'box-shadow': node().changed
                  ? '0 0 0 5px color-mix(in oklch, var(--accent) 25%, transparent)'
                  : props.selectedId() === node().id
                    ? '0 0 0 3px var(--accent-10)'
                    : 'var(--shadow-sm)',
                transition: 'box-shadow 180ms ease, background 180ms ease, border-color 180ms ease',
                color: 'var(--fg)',
                overflow: 'hidden',
              }}
            >
              <div style={{ 'font-size': '9px', 'text-transform': 'uppercase', 'letter-spacing': '0.09em', color: 'var(--fg-muted)', 'margin-bottom': '7px' }}>
                {style().tag}
              </div>
              <div style={{ 'font-size': '12px', 'font-weight': 650, 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                {node().title}
              </div>
              <div style={{ 'font-size': '10px', color: 'var(--fg-muted)', 'margin-top': '4px', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
                {node().detail}
              </div>
            </div>
          </NodeContainer>
        );
      }}
    </Index>
  );
}

function ImpulseMarker(props: { node: () => RayonRenderNode; frame: () => RayonImpulseFrame | null }): JSX.Element {
  const color = () => CARRIER_COLOR[props.frame()?.carrier ?? 'control'];
  return (
    <div
      data-no-pan="true"
      style={{
        position: 'absolute',
        left: `${props.node().x + props.node().w / 2}px`,
        top: `${props.node().y - 18}px`,
        transform: 'translate(-50%, -50%)',
        transition: 'left 260ms cubic-bezier(.2,.8,.2,1), top 260ms cubic-bezier(.2,.8,.2,1)',
        'z-index': 50,
        display: 'flex',
        'align-items': 'center',
        gap: '7px',
        'pointer-events': 'none',
      }}
    >
      <span style={{ width: '13px', height: '13px', 'border-radius': '999px', background: color(), 'box-shadow': `0 0 0 5px color-mix(in oklch, ${color()} 22%, transparent), 0 3px 10px color-mix(in oklch, ${color()} 45%, transparent)` }} />
      <span style={{ display: 'flex', gap: '6px', padding: '4px 7px', 'border-radius': '5px', background: 'var(--overlay)', border: `1px solid ${color()}`, color: 'var(--fg)', 'font-family': 'ui-monospace, monospace', 'font-size': '10px', 'box-shadow': 'var(--shadow-sm)', 'white-space': 'nowrap' }}>
        <strong style={{ color: color(), 'font-size': '8px', 'letter-spacing': '0.08em', 'text-transform': 'uppercase' }}>{props.frame()?.carrier}</strong>
        <span>{props.frame()?.payload}</span>
      </span>
    </div>
  );
}
