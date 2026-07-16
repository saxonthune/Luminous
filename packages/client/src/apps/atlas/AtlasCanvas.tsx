import { For, Show, createMemo, createEffect, type JSX } from 'solid-js';
import { marked } from 'marked';
import type { AtlasDocument, AtlasNode } from '@luminous/core/atlas';
import { Canvas, NodeContainer, useCanvasContext } from '@luminous/cactus';
import type { CanvasRef } from '@luminous/cactus';
import { NODE_HEIGHT, toEdgeDeclarations, projectAtlasNodes, type AtlasRenderNode } from './projection.ts';

// Scoped styling for the rendered Description markdown — mirrors dataflow's
// BoxContent MD_STYLES but scoped under its own class.
const ATLAS_NODE_MD_STYLES = `
.atlas-node-md p { margin: 0 0 .35rem; }
.atlas-node-md ul { margin: 0 0 .35rem; padding-left: 1rem; list-style: disc; }
.atlas-node-md li { margin: .1rem 0; }
.atlas-node-md code { font-family: ui-monospace, monospace; background: var(--cactus-surface-alt, #f3f4f6); padding: .05rem .25rem; border-radius: 3px; font-size: .9em; }
.atlas-node-md strong { font-weight: 600; }
.atlas-node-md > :last-child { margin-bottom: 0; }
`;

export interface AtlasCanvasProps {
  doc: AtlasDocument;
}

/** The node's header — fixed to NODE_HEIGHT regardless of the container's
 * shrink-wrapped total size, so it never stretches over its children's area. */
function AtlasNodeContent(props: { node: AtlasNode }): JSX.Element {
  return (
    <div
      class="flex w-full flex-col gap-1 overflow-hidden rounded border border-border-subtle bg-surface p-2"
      style={{ height: `${NODE_HEIGHT}px` }}
    >
      <div class="text-sm font-semibold text-fg">{props.node.name}</div>
      <Show when={props.node.description}>
        {/* SECURITY: marked does not sanitize HTML; atlas documents are
            author-controlled workspace files, same trust class as graph data
            (see InfoModal.tsx). */}
        <div
          class="atlas-node-md text-xs text-fg-muted"
          // eslint-disable-next-line solid/no-innerhtml
          innerHTML={marked.parse(props.node.description!, { async: false }) as string}
        />
      </Show>
      <Show when={props.node.contract}>
        <div class="mt-auto">
          <div class="text-[10px] uppercase tracking-wide text-fg-subtle">
            {props.node.contract?.format}
          </div>
          <pre class="max-h-16 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-alt p-1 text-[10px] text-fg-muted">
            {props.node.contract?.text}
          </pre>
        </div>
      </Show>
    </div>
  );
}

/**
 * Renders the node layer inside <Canvas>'s provider — registerNodeRect and
 * hit-testing need useCanvasContext, which only resolves inside Canvas's
 * children (see the same constraint noted at DataflowCanvas.tsx:57-61).
 */
function AtlasNodeLayer(props: { nodes: () => AtlasRenderNode[] }): JSX.Element {
  const ctx = useCanvasContext();
  return (
    <For each={props.nodes()}>
      {(rn) => (
        <NodeContainer
          nodeId={rn.node.id}
          x={() => rn.x}
          y={() => rn.y}
          w={() => rn.w}
          h={() => rn.h}
          softContainer={() => rn.hasChildren}
          onPointerDown={(e) => ctx.onNodePointerDown(rn.node.id, e)}
        >
          <AtlasNodeContent node={rn.node} />
        </NodeContainer>
      )}
    </For>
  );
}

export function AtlasCanvas(props: AtlasCanvasProps): JSX.Element {
  let canvasRef: CanvasRef | undefined;

  const nodes = createMemo(() => projectAtlasNodes(props.doc));
  const edges = createMemo(() => toEdgeDeclarations(props.doc));

  createEffect(() => {
    const list = nodes();
    if (!canvasRef || list.length === 0) return;
    const rects = list.map((n) => ({ x: n.x, y: n.y, width: n.w, height: n.h }));
    canvasRef.fitView(rects, 64);
  });

  return (
    <>
      <style>{ATLAS_NODE_MD_STYLES}</style>
      <div style={{ position: 'relative', flex: '1 1 auto', 'min-height': 0 }}>
        <Canvas ref={(r) => { canvasRef = r; }} edges={edges()}>
          <AtlasNodeLayer nodes={nodes} />
        </Canvas>
      </div>
    </>
  );
}
