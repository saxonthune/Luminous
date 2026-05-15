import { For, createResource, Show, createMemo, createSignal, createEffect } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { JSX } from 'solid-js';
import type { Graph, View, DisclosureLevel, RenderContext } from '@luminous/core';
import { evaluateView, getNodeRenderer, getEdgeRenderer } from '@luminous/core';
import type { ChromeSchema, MenuSchema } from '@luminous/core';
import {
  Canvas,
  NodeContainer,
  resolveAbsolutePositionByParentOf,
  gridLayout,
  elkLayout,
  useCanvasContext,
  useNodeDrag,
} from '@luminous/cactus';
import type { ElkLayoutOutput, CanvasRef, EdgeDeclaration } from '@luminous/cactus';
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
  chrome?: ChromeSchema;
  onAction?: (id: string, payload?: unknown) => void;
  nodeContextMenu?: (nodeId: string) => MenuSchema | undefined;
  backgroundContextMenu?: () => MenuSchema | undefined;
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
  onPointerDown?: (nodeId: string, e: PointerEvent) => void,
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
            onPointerDown={onPointerDown ? (e) => onPointerDown(nodeId, e) : undefined}
          >
            <Show
              when={getNodeRenderer(node.kind, renderCtx.level())}
              fallback={
                <div style={{ padding: '4px', 'font-size': '11px', color: '#555' }}>
                  <strong>{node.kind}</strong>
                </div>
              }
            >
              {(renderer) => renderer()(node, renderCtx) as JSX.Element}
            </Show>
          </NodeContainer>
        );
      }}
    </For>
  );
}

/**
 * Inner component rendered inside <Canvas> so it can access CanvasContext.
 * Exposes its computed edges via the onEdges callback (called reactively when edges change).
 */
function CanvasInner(props: {
  graph: Graph;
  view: View;
  algorithm?: 'grid' | 'elk';
  exposeRects?: (getter: () => NodeRect[]) => void;
  onEdges?: (edges: EdgeDeclaration[]) => void;
  exposeInspect?: (fn: (id: string) => void) => void;
}): JSX.Element {
  ensurePacksRegistered();
  const inspector = createInspector();
  const canvasCtx = useCanvasContext();

  // eslint-disable-next-line solid/reactivity -- exposeInspect is a one-shot registration callback
  props.exposeInspect?.((id) => inspector.open(id));

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
    get graph() { return props.graph; },
    inspect: (id) => inspector.open(id),
  };

  // Build and expose edge declarations reactively.
  const edgeDeclarations = createMemo<EdgeDeclaration[]>(() => {
    const decls: EdgeDeclaration[] = [];
    const currentLevel = level();

    for (const edge of scene().arrows) {
      const edgeRenderer = getEdgeRenderer(edge.kind, currentLevel);
      const capturedEdge = edge;
      const label = edgeRenderer
        ? () => edgeRenderer(capturedEdge, renderCtx) as JSX.Element
        : undefined;
      decls.push({
        id: edge.id,
        sourceId: edge.from,
        targetId: edge.to,
        styling: { arrowHead: true, dash: 'solid' },
        label,
      });
    }

    for (const edge of scene().summaryEdges) {
      const edgeRenderer = getEdgeRenderer(edge.kind, currentLevel);
      const capturedEdge = edge;
      const label = edgeRenderer
        ? () => edgeRenderer(capturedEdge, renderCtx) as JSX.Element
        : undefined;
      decls.push({
        id: edge.id,
        sourceId: edge.from,
        targetId: edge.to,
        styling: { dash: 'dotted', arrowHead: false },
        label,
      });
    }

    return decls;
  });

  createEffect(() => {
    props.onEdges?.(edgeDeclarations());
  });

  // --- Node drag ---
  const [nodeOverrides, setNodeOverrides] = createSignal<Map<string, { x: number; y: number }>>(new Map());
  const dragStartPositions = new Map<string, { x: number; y: number }>();
  let latestBasePositions: ReadonlyMap<string, { x: number; y: number }> = new Map();

  const { onPointerDown: dragPointerDown } = useNodeDrag({
    zoomScale: () => canvasCtx.transform().k,
    handleSelector: '[data-drag-handle="true"]',
    callbacks: {
      onDragStart: (nodeId) => {
        const overridePos = nodeOverrides().get(nodeId);
        const basePos = latestBasePositions.get(nodeId);
        const pos = overridePos ?? basePos;
        if (pos) dragStartPositions.set(nodeId, { ...pos });
      },
      onDrag: (nodeId, dx, dy) => {
        const start = dragStartPositions.get(nodeId);
        if (!start) return;
        setNodeOverrides((prev) => {
          const next = new Map(prev);
          next.set(nodeId, { x: start.x + dx, y: start.y + dy });
          return next;
        });
      },
      onDragEnd: (nodeId) => {
        dragStartPositions.delete(nodeId);
      },
    },
  });

  function applyOverrides(
    base: { positions: ReadonlyMap<string, { x: number; y: number }>; sizes: ReadonlyMap<string, { w: number; h: number }> },
  ) {
    const overrides = nodeOverrides();
    if (overrides.size === 0) return base;
    const positions = new Map(base.positions);
    for (const [id, pos] of overrides) positions.set(id, pos);
    return { ...base, positions };
  }

  // Both layouts are created unconditionally so the chosen one can swap reactively
  // with props.algorithm. The elk source returns null when not selected, suppressing fetches.
  const [elkResult] = createResource(
    () => props.algorithm === 'elk'
      ? {
          rootIds: containment().rootIds,
          childrenOf: containment().childrenOf,
          edges: scene().arrows.map((a) => ({ id: `${a.from}->${a.to}`, from: a.from, to: a.to })),
        }
      : null,
    (input): Promise<ElkLayoutOutput> => elkLayout({ ...input, direction: 'RIGHT' }),
  );

  const gridResult = createMemo(() => gridLayout({
    rootIds: containment().rootIds,
    childrenOf: containment().childrenOf,
  }));

  const baseLayout = createMemo<{ positions: ReadonlyMap<string, { x: number; y: number }>; sizes: ReadonlyMap<string, { w: number; h: number }> } | null>(
    () => props.algorithm === 'elk' ? (elkResult() ?? null) : gridResult(),
  );

  createEffect(() => {
    const base = baseLayout();
    if (base) latestBasePositions = base.positions;
  });

  const effectiveLayout = createMemo(() => {
    const base = baseLayout();
    return base ? applyOverrides(base) : null;
  });

  const getRects = (): NodeRect[] => {
    const lay = effectiveLayout();
    if (!lay) return [];
    return containment().rootIds.flatMap((id) => {
      const pos = lay.positions.get(id);
      const sz = lay.sizes.get(id);
      return pos && sz ? [{ id, x: pos.x, y: pos.y, width: sz.w, height: sz.h }] : [];
    });
  };
  // eslint-disable-next-line solid/reactivity -- exposeRects is a one-shot registration callback
  props.exposeRects?.(getRects);

  return (
    <InspectorContext.Provider value={inspector}>
      <Show
        when={effectiveLayout()}
        fallback={<div style={{ padding: '8px', color: '#888' }}>Computing layout…</div>}
      >
        {/* eslint-disable-next-line solid/reactivity -- renderNodes returns JSX evaluated inside the Show's tracked scope */}
        {(layout) => renderNodes(props.graph, renderOrder, layout, () => containment().parentOf, renderCtx, dragPointerDown)}
      </Show>
      <Portal mount={document.body}>
        <InspectorPanel graph={props.graph} view={props.view} />
      </Portal>
    </InspectorContext.Provider>
  );
}

export function PgCanvasView(props: PgCanvasViewProps): JSX.Element {
  let canvasHandle: CanvasRef | undefined;
  let getRects: (() => NodeRect[]) | undefined;
  let inspectFn: ((id: string) => void) | undefined;

  const [edges, setEdges] = createSignal<EdgeDeclaration[]>([]);

  const emit = () => {
    if (!canvasHandle || !getRects || !props.ref) return;
    props.ref({
      fitView: () => canvasHandle!.fitView(getRects!(), 64),
      zoomIn: () => canvasHandle!.zoomIn(),
      zoomOut: () => canvasHandle!.zoomOut(),
    });
  };

  const handleAction = (id: string, payload?: unknown) => {
    if (id === 'NODE.INSPECT') {
      inspectFn?.((payload as { nodeId: string }).nodeId);
    } else {
      props.onAction?.(id, payload);
    }
  };

  return (
    <Canvas
      ref={(r) => { canvasHandle = r; emit(); }}
      edges={edges()}
      chrome={props.chrome}
      onAction={handleAction}
      nodeContextMenu={props.nodeContextMenu}
      backgroundContextMenu={props.backgroundContextMenu}
    >
      <CanvasInner
        graph={props.graph}
        view={props.view}
        algorithm={props.algorithm}
        exposeRects={(g) => { getRects = g; emit(); }}
        onEdges={setEdges}
        exposeInspect={(fn) => { inspectFn = fn; }}
      />
    </Canvas>
  );
}
