import { For, Show, createMemo, createEffect } from 'solid-js';
import type { JSX } from 'solid-js';
import type { DataflowDocument } from '@luminous/core/dataflow';
import { Canvas, NodeContainer, dagLayout } from '@luminous/cactus';
import type { CanvasRef } from '@luminous/cactus';
import { BOX_WIDTH, toTidyNodes, toLayoutEdges, toEdgeDeclarations } from './projection';

export interface DataflowCanvasProps {
  doc: DataflowDocument;
}

export function DataflowCanvas(props: DataflowCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;

  const nodes = createMemo(() => toTidyNodes(props.doc));
  const sizes = createMemo(() => new Map(nodes().map((n) => [n.id, { w: n.w, h: n.h }])));
  const positions = createMemo(() => dagLayout(nodes(), toLayoutEdges(props.doc)));
  const edges = createMemo(() => toEdgeDeclarations(props.doc));
  const boxesById = createMemo(() => new Map(props.doc.boxes.map((b) => [b.id, b])));

  createEffect(() => {
    const pos = positions();
    const sz = sizes();
    if (!canvasRef || pos.size === 0) return;
    const rects = [...pos.entries()].map(([id, p]) => {
      const s = sz.get(id) ?? { w: BOX_WIDTH, h: 72 };
      return { x: p.x, y: p.y, width: s.w, height: s.h };
    });
    canvasRef.fitView(rects, 64);
  });

  return (
    <Canvas ref={(r) => { canvasRef = r; }} edges={edges()}>
      <For each={nodes()}>
        {(node) => {
          const box = () => boxesById().get(node.id);
          const pos = () => positions().get(node.id) ?? { x: 0, y: 0 };
          return (
            <NodeContainer
              nodeId={node.id}
              x={() => pos().x}
              y={() => pos().y}
              w={() => node.w}
              h={() => node.h}
            >
              <div class="flex h-full w-full flex-col gap-1 overflow-hidden rounded border border-border-subtle bg-surface p-2">
                <div class="text-sm font-semibold text-fg">{box()?.name}</div>
                <Show when={box()?.description}>
                  <p class="text-xs text-fg-muted">{box()?.description}</p>
                </Show>
                <Show when={box()?.contract}>
                  <div class="mt-auto">
                    <div class="text-[10px] uppercase tracking-wide text-fg-subtle">
                      {box()?.contract?.format}
                    </div>
                    <pre class="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-alt p-1 text-[10px] text-fg-muted">
                      {box()?.contract?.text}
                    </pre>
                  </div>
                </Show>
              </div>
            </NodeContainer>
          );
        }}
      </For>
    </Canvas>
  );
}
