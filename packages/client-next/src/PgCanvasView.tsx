import { For } from 'solid-js';
import type { JSX } from 'solid-js';
import type { Graph, View, Node } from '@luminous/canvas-core';
import { evaluateView } from '@luminous/canvas-core';
import { Canvas, NodeContainer, resolveAbsolutePositionByParentOf, gridLayout } from '@luminous/cactus';

export interface PgCanvasViewProps {
  graph: Graph;
  view: View;
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

function propsPreview(node: Node): string {
  const entries = Object.entries(node.props).slice(0, 3);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
}

export function PgCanvasView(props: PgCanvasViewProps): JSX.Element {
  const scene = evaluateView(props.graph, props.view);
  const { containment } = scene;

  const layout = gridLayout({
    rootIds: containment.rootIds,
    childrenOf: containment.childrenOf,
  });

  const renderOrder = bfsOrder(containment.rootIds, containment.childrenOf);

  return (
    <Canvas>
      <For each={renderOrder}>
        {(nodeId) => {
          const node = props.graph.nodes.get(nodeId);
          if (!node) return null;
          const abs = resolveAbsolutePositionByParentOf(nodeId, layout.positions, containment.parentOf);
          const sz = layout.sizes.get(nodeId) ?? { w: 120, h: 60 };
          return (
            <NodeContainer
              nodeId={nodeId}
              x={() => abs.x}
              y={() => abs.y}
              w={() => sz.w}
              h={() => sz.h}
            >
              <div style={{ padding: '4px', 'font-size': '11px', color: '#555' }}>
                <strong>{node.kind}</strong>
                {propsPreview(node) && <span> — {propsPreview(node)}</span>}
              </div>
            </NodeContainer>
          );
        }}
      </For>
    </Canvas>
  );
}
