import { For, createResource, Show, createMemo } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { JSX } from 'solid-js';
import type { Graph, View, Node, DisclosureLevel, RenderContext } from '@luminous/canvas-core';
import { evaluateView, getNodeRenderer } from '@luminous/canvas-core';
import { Canvas, NodeContainer, resolveAbsolutePositionByParentOf, gridLayout, elkLayout, useCanvasContext } from '@luminous/cactus';
import type { ElkLayoutOutput } from '@luminous/cactus';
import { InspectorContext } from './inspector/InspectorContext';
import { createInspector } from './inspector/createInspector';
import { InspectorPanel } from './inspector/InspectorPanel';
import { ensurePacksRegistered } from './registerPacks';
import { levelFromZoom } from './disclosure/levelFromZoom';

export interface PgCanvasViewProps {
  graph: Graph;
  view: View;
  algorithm?: 'grid' | 'elk';
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
  renderOrder: string[],
  layout: { positions: ReadonlyMap<string, { x: number; y: number }>; sizes: ReadonlyMap<string, { w: number; h: number }> },
  parentOf: ReadonlyMap<string, string>,
  renderCtx: RenderContext,
): JSX.Element {
  return (
    <For each={renderOrder}>
      {(nodeId) => {
        const node = graph.nodes.get(nodeId);
        if (!node) return null;
        const abs = resolveAbsolutePositionByParentOf(nodeId, layout.positions, parentOf);
        const sz = layout.sizes.get(nodeId) ?? { w: 120, h: 60 };
        return (
          <NodeContainer
            nodeId={nodeId}
            x={() => abs.x}
            y={() => abs.y}
            w={() => sz.w}
            h={() => sz.h}
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
}): JSX.Element {
  ensurePacksRegistered();
  const inspector = createInspector();
  const canvasCtx = useCanvasContext();
  const scene = evaluateView(props.graph, props.view);
  const { containment } = scene;
  const renderOrder = bfsOrder(containment.rootIds, containment.childrenOf);

  const level = createMemo<DisclosureLevel>(() =>
    levelFromZoom(canvasCtx.transform().k, props.view.zoomToLevel)
  );

  const renderCtx: RenderContext = {
    level,
    zoom: () => canvasCtx.transform().k,
    view: props.view,
    graph: props.graph,
    inspect: (id) => inspector.open(id),
  };

  if (props.algorithm === 'elk') {
    const [elkResult] = createResource<ElkLayoutOutput>(() =>
      elkLayout({
        rootIds: containment.rootIds,
        childrenOf: containment.childrenOf,
        edges: scene.arrows.map((a) => ({ id: `${a.from}->${a.to}`, from: a.from, to: a.to })),
        direction: 'RIGHT',
      })
    );

    return (
      <InspectorContext.Provider value={inspector}>
        <Show when={elkResult()} fallback={<div style={{ padding: '8px', color: '#888' }}>Computing layout…</div>}>
          {(layout) => renderNodes(props.graph, renderOrder, layout(), containment.parentOf, renderCtx)}
        </Show>
        <Portal mount={document.body}>
          <InspectorPanel graph={props.graph} view={props.view} />
        </Portal>
      </InspectorContext.Provider>
    );
  }

  const layout = gridLayout({
    rootIds: containment.rootIds,
    childrenOf: containment.childrenOf,
  });

  return (
    <InspectorContext.Provider value={inspector}>
      {renderNodes(props.graph, renderOrder, layout, containment.parentOf, renderCtx)}
      <Portal mount={document.body}>
        <InspectorPanel graph={props.graph} view={props.view} />
      </Portal>
    </InspectorContext.Provider>
  );
}

export function PgCanvasView(props: PgCanvasViewProps): JSX.Element {
  return (
    <Canvas>
      <CanvasInner graph={props.graph} view={props.view} algorithm={props.algorithm} />
    </Canvas>
  );
}
