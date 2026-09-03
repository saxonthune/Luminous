import { For, Show, createMemo, createSignal, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { LinenAction, LinenDocument } from '@luminous/core/linen';
import { applyLinenBatch, connect, kindDescriptor } from '@luminous/core/linen';
import { Canvas, ConnectionPreview, NodeContainer, useCanvasContext, useGesture } from '@luminous/cactus';
import type { CanvasRef } from '@luminous/cactus';
import { MODULE_HEADER, MODULE_PADDING, projectLinen, renderNodeId, type LinenRenderNode } from './projection.ts';
import { glyphFor } from './glyphs.tsx';
import { AnnotationPanel } from './AnnotationPanel.tsx';

const EDGE_TAB_SIZE = 18;

export interface LinenCanvasProps {
  doc: LinenDocument;
  dispatchDoc: (next: LinenDocument) => void;
  onRefused?: (message: string) => void;
}

export function LinenCanvas(props: LinenCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;
  const [selectedId, setSelectedId] = createSignal<string | null>(null);

  const projection = createMemo(() => projectLinen(props.doc));
  const renderNodes = createMemo(() => projection().nodes);
  const edges = createMemo(() => projection().edges);

  function dispatchAction(actions: LinenAction[]): void {
    if (actions.length === 0) return;
    const result = applyLinenBatch(props.doc, actions);
    if (!result.ok) {
      props.onRefused?.(result.error);
      return;
    }
    props.dispatchDoc(result.doc);
  }

  // A drop persists the Trace Node's Module-relative x/y so it no longer
  // snaps back to its derived slot.
  function endDrag(nodeId: string, dx: number, dy: number) {
    const rn = renderNodes().find((n) => n.kind === 'trace-node' && n.node.id === nodeId);
    if (rn === undefined || rn.kind !== 'trace-node') return;
    const moduleRn = renderNodes().find((n) => n.kind === 'module' && n.module.id === rn.node.module);
    if (moduleRn === undefined || moduleRn.kind !== 'module') return;
    const relX = rn.x + dx - (moduleRn.x + MODULE_PADDING);
    const relY = rn.y + dy - (moduleRn.y + MODULE_HEADER + MODULE_PADDING);
    dispatchAction([{ type: 'setNode', id: nodeId, x: relX, y: relY }]);
  }

  function onConnect(c: { source: string; target: string }) {
    const result = connect(props.doc, c.source, c.target);
    if (!result.ok) {
      props.onRefused?.(result.error);
      return;
    }
    props.dispatchDoc(result.doc);
  }

  function fitAll() {
    const list = renderNodes();
    if (!canvasRef || list.length === 0) return;
    canvasRef.fitView(list.map((n) => ({ x: n.x, y: n.y, width: n.w, height: n.h })), 64);
  }

  return (
    <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
      <Canvas
        ref={(r) => { canvasRef = r; }}
        edges={edges()}
        onSelectionChange={(ids) => setSelectedId(ids.length > 0 ? ids[0] : null)}
        onAction={(id) => { if (id === 'view.fit') fitAll(); }}
        connectionDrag={{
          onConnect,
          isValidConnection: (c) => connect(props.doc, c.source, c.target).ok,
        }}
        renderConnectionPreview={(coords) => (
          <ConnectionPreview
            d={`M ${coords.startX} ${coords.startY} L ${coords.currentX} ${coords.currentY}`}
            stroke="var(--accent)"
          />
        )}
      >
        <LinenNodeLayer nodes={renderNodes} onDragEnd={endDrag} />
      </Canvas>
      <AnnotationPanel
        doc={props.doc}
        selectedId={selectedId()}
        onAnnotationCommit={(nodeId, annotation) => dispatchAction([{ type: 'setAnnotation', id: nodeId, annotation }])}
      />
    </div>
  );
}

interface LinenNodeLayerProps {
  nodes: () => LinenRenderNode[];
  onDragEnd: (nodeId: string, dx: number, dy: number) => void;
}

/** Rendered inside <Canvas> so useCanvasContext resolves (same constraint as
 * AtlasNodeLayer). */
function LinenNodeLayer(props: LinenNodeLayerProps): JSX.Element {
  const ctx = useCanvasContext();
  const gesture = useGesture({
    zoomScale: () => ctx.transform().k,
    callbacks: {
      onDragEnd: (nodeId, dx, dy) => props.onDragEnd(nodeId, dx, dy),
    },
  });
  const dragDelta = (id: string) => {
    const g = gesture.gesture();
    if (g.kind !== 'draggingNode' || g.nodeId !== id) return { dx: 0, dy: 0 };
    return gesture.dragDelta();
  };

  return (
    <For each={props.nodes()}>
      {(rn) => {
        if (rn.kind === 'resume') {
          return (
            <div
              data-testid={`resume-${rn.passId}`}
              style={{
                position: 'absolute',
                left: `${rn.x}px`,
                top: `${rn.y}px`,
                width: `${rn.w}px`,
                height: `${rn.h}px`,
                'pointer-events': 'none',
                display: 'flex',
                'align-items': 'center',
                gap: '4px',
                padding: '0 6px',
                border: '1px dashed var(--border)',
                'border-radius': '4px',
                color: 'var(--fg-muted)',
                'font-size': '10px',
                'white-space': 'nowrap',
                overflow: 'hidden',
              }}
            >
              ⇠ {rn.contractName}
            </div>
          );
        }
        const id = renderNodeId(rn);
        const [hovered, setHovered] = createSignal(false);
        const isModule = rn.kind === 'module';
        const isTraceNode = rn.kind === 'trace-node';
        const delta = () => (isTraceNode ? dragDelta(id) : { dx: 0, dy: 0 });
        return (
          <div onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
            <NodeContainer
              nodeId={id}
              x={() => rn.x + delta().dx}
              y={() => rn.y + delta().dy}
              w={() => rn.w}
              h={() => rn.h}
              visualBand={() => (isModule ? 2 * rn.depth : 10)}
              softContainer={() => isModule}
              containerInset={() => ({ top: MODULE_HEADER, left: 0, right: 0, bottom: 0 })}
              onPointerDown={(e) => {
                ctx.onNodePointerDown(id, e);
                if (isTraceNode) gesture.beginPress(id, e);
              }}
            >
              <Show when={isModule && rn.kind === 'module'}>
                <div
                  style={{
                    height: `${MODULE_HEADER}px`,
                    display: 'flex',
                    'align-items': 'center',
                    padding: '0 10px',
                    'font-size': '12px',
                    'font-weight': '600',
                    color: 'var(--fg)',
                    'border-bottom': ctx.isSelected(id) ? '2px solid var(--accent)' : '1px solid var(--border)',
                  }}
                >
                  {rn.kind === 'module' ? rn.module.name : ''}
                </div>
              </Show>
              <Show when={rn.kind === 'trace-node' ? rn : null}>
                {(t) => (
                  <div
                    title={kindDescriptor(t().node.kind).term}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '6px',
                      height: '100%',
                      padding: '0 6px',
                      background: 'var(--surface)',
                      border: ctx.isSelected(id) ? '2px solid var(--accent)' : '1px solid var(--border)',
                      'border-radius': '6px',
                      color: 'var(--fg)',
                      cursor: 'grab',
                      'font-size': '11px',
                      'white-space': 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    <Dynamic component={glyphFor(kindDescriptor(t().node.kind).glyph)} size={18} />
                    <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{t().node.id}</span>
                  </div>
                )}
              </Show>
              <Show when={rn.kind === 'contract' ? rn : null}>
                {(c) => (
                  <div
                    style={{
                      display: 'flex',
                      'flex-direction': 'column',
                      'justify-content': 'center',
                      height: '100%',
                      padding: '0 8px',
                      background: 'var(--surface-alt)',
                      border: ctx.isSelected(id) ? '2px solid var(--accent)' : '1px dashed var(--border)',
                      'border-radius': '6px',
                      'font-size': '11px',
                      color: 'var(--fg)',
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ 'font-weight': '600' }}>{c().contract.name}</span>
                    <span style={{ color: 'var(--fg-muted)', 'font-size': '10px' }}>Contract</span>
                  </div>
                )}
              </Show>
            </NodeContainer>
            <Show when={!isModule && hovered()}>
              <div
                data-no-pan="true"
                style={{
                  position: 'absolute',
                  left: `${rn.x + delta().dx + rn.w - 6}px`,
                  top: `${rn.y + delta().dy - 6}px`,
                  width: `${EDGE_TAB_SIZE}px`,
                  height: `${EDGE_TAB_SIZE}px`,
                  'z-index': '20',
                  'border-radius': '9999px',
                  background: 'var(--accent)',
                  color: 'var(--on-accent, #fff)',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'font-size': '12px',
                  cursor: 'pointer',
                }}
                on:pointerdown={(e: PointerEvent) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  ctx.startConnection(id, null, e.clientX, e.clientY);
                }}
              >
                +
              </div>
            </Show>
          </div>
        );
      }}
    </For>
  );
}
