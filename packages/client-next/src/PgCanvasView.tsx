import { For, createResource, Show, createMemo } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { JSX } from 'solid-js';
import type { Graph, View, DisclosureLevel, RenderContext } from '@luminous/core';
import { evaluateView, getNodeRenderer } from '@luminous/core';
import { Canvas, NodeContainer, resolveAbsolutePositionByParentOf, gridLayout, elkLayout, useCanvasContext } from '@luminous/cactus';
import type { ElkLayoutOutput, CanvasRef } from '@luminous/cactus';
import { InspectorContext } from './inspector/InspectorContext';
import { createInspector } from './inspector/createInspector';
import { InspectorPanel } from './inspector/InspectorPanel';
import { ensurePacksRegistered } from './registerPacks';
import { levelFromZoom } from './disclosure/levelFromZoom';

export interface ViewerHandle {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

type NodeRect = { id: string; x: number; y: number; width: number; height: number };

export interface PgCanvasViewProps {
  graph: Graph;
  view: View;
  algorithm?: 'grid' | 'elk';
  ref?: (handle: ViewerHandle) => void;
}

/** BFS topological order from roots through childrenOf — parents before children. */
function bfsOrder(
  rootIds: readonly string[],
  childrenOf: ReadonlyMap<string, ReadonlyArray<string>>
): string[] {
  const order: string[] = [];
  const queue: string[] = [...rootIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const children = childrenOf.get(id) ?? [];
    queue.push(...children);
  }
  return order;
}

function renderNodes(
  graph: Graph,
  renderOrder: () => string[],
  layout: () => { positions: ReadonlyMap<string, { x: number; y: number }>; sizes: ReadonlyMap<string, { w: number; h: number }> },
  parentOf: () => ReadonlyMap<string, string>,
  renderCtx: RenderContext,
): JSX.Element {
  return (
    <For each={renderOrder()}>
      {(nodeId) => {
        const node = graph.nodes.get(nodeId);
        if (!node) return null;
        const abs = createMemo(() => resolveAbsolutePositionByParentOf(nodeId, layout().positions, parentOf()));
        const sz = createMemo(() => layout().sizes.get(nodeId) ?? { w: 120, h: 60 });
        return (
          <NodeContainer
            nodeId={nodeId}
            x={() => abs().x}
            y={() => abs().y}
            w={() => sz().w}
            h={() => sz().h}
            onContextMenu={(e) => {
              e.preventDefault();
              renderCtx.inspect(nodeId);
            }}
          >
            {(() => {
              const renderer = getNodeRenderer(node.kind, renderCtx.level());
              return renderer ? renderer(node, renderCtx) as JSX.Element : (
                <div style={{ padding: '4px', 'font-size': '11px', color: '#555' }}>
                  <strong>{node.kind}</strong>
                </div>
              );
            })()}
          </NodeContainer>
        );
      }}
    </For>
  );
}

/**
 * Inner component rendered inside <Canvas> so it can access CanvasContext
 * via createInspector(). Uses a Portal to render the inspector panel outside
 * the Canvas's CSS transform so position:fixed works correctly.
 */
function CanvasInner(props: {
  graph: Graph;
  view: View;
  algorithm?: 'grid' | 'elk';
  exposeRects?: (getter: () => NodeRect[]) => void;
}): JSX.Element {
  ensurePacksRegistered();
  const inspector = createInspector();
  const canvasCtx = useCanvasContext();

  const scene = createMemo(() => evaluateView(props.graph, props.view));
  const containment = createMemo(() => scene().containment);
  const renderOrder = createMemo(() => bfsOrder(containment().rootIds, containment().childrenOf));

  const level = createMemo<DisclosureLevel>(() =>
    levelFromZoom(canvasCtx.transform().k, props.view.zoomToLevel)
  );

  const renderCtx: RenderContext = {
    level,
    zoom: () => canvasCtx.transform().k,
    get view() { return props.view; },
    graph: props.graph,
    inspect: (id) => inspector.open(id),
  };

  if (props.algorithm === 'elk') {
    const [elkResult] = createResource(
      () => ({
        rootIds: containment().rootIds,
        childrenOf: containment().childrenOf,
        edges: scene().arrows.map((a) => ({ id: `${a.from}->${a.to}`, from: a.from, to: a.to })),
      }),
      (input): Promise<ElkLayoutOutput> => elkLayout({ ...input, direction: 'RIGHT' }),
    );

    props.exposeRects?.(() => {
      const lay = elkResult();
      if (!lay) return [];
      return containment().rootIds.flatMap((id) => {
        const pos = lay.positions.get(id);
        const sz = lay.sizes.get(id);
        return pos && sz ? [{ id, x: pos.x, y: pos.y, width: sz.w, height: sz.h }] : [];
      });
    });

    return (
      <InspectorContext.Provider value={inspector}>
        <Show when={elkResult()} fallback={<div style={{ padding: '8px', color: '#888' }}>Computing layout…</div>}>
          {(layout) => renderNodes(props.graph, renderOrder, layout, () => containment().parentOf, renderCtx)}
        </Show>
        <Portal mount={document.body}>
          <InspectorPanel graph={props.graph} view={props.view} />
        </Portal>
      </InspectorContext.Provider>
    );
  }

  const layout = createMemo(() => gridLayout({
    rootIds: containment().rootIds,
    childrenOf: containment().childrenOf,
  }));

  props.exposeRects?.(() => {
    const lay = layout();
    return containment().rootIds.flatMap((id) => {
      const pos = lay.positions.get(id);
      const sz = lay.sizes.get(id);
      return pos && sz ? [{ id, x: pos.x, y: pos.y, width: sz.w, height: sz.h }] : [];
    });
  });

  return (
    <InspectorContext.Provider value={inspector}>
      {renderNodes(props.graph, renderOrder, layout, () => containment().parentOf, renderCtx)}
      <Portal mount={document.body}>
        <InspectorPanel graph={props.graph} view={props.view} />
      </Portal>
    </InspectorContext.Provider>
  );
}

export function PgCanvasView(props: PgCanvasViewProps): JSX.Element {
  let canvasHandle: CanvasRef | undefined;
  let getRects: (() => NodeRect[]) | undefined;

  const emit = () => {
    if (!canvasHandle || !getRects || !props.ref) return;
    props.ref({
      fitView: () => canvasHandle!.fitView(getRects!(), 64),
      zoomIn: () => canvasHandle!.zoomIn(),
      zoomOut: () => canvasHandle!.zoomOut(),
    });
  };

  return (
    <Canvas ref={(r) => { canvasHandle = r; emit(); }}>
      <CanvasInner
        graph={props.graph}
        view={props.view}
        algorithm={props.algorithm}
        exposeRects={(g) => { getRects = g; emit(); }}
      />
    </Canvas>
  );
}
